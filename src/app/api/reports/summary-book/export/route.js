import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { Workbook } from 'exceljs';
import { pdf } from '@react-pdf/renderer';
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import StockMovement from '@/models/StockMovement';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

function buildDateRange(from, to) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to || from);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function buildRows(stationId, from, to) {
  const { start, end } = buildDateRange(from, to);
  const stationObjectId = new mongoose.Types.ObjectId(stationId);

  const [dayShifts, sales, stockIns, readings, tankEntries] = await Promise.all([
    DayShift.aggregate([
      { $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } },
      { $sort: { date: 1 } },
    ]),
    SalesEntry.aggregate([{ $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } }]),
    StockMovement.aggregate([
      { $match: { stationId: stationObjectId, movementType: 'receipt', date: { $gte: start, $lte: end } } },
    ]),
    MeterReading.aggregate([{ $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } }]),
    TankStockEntry.aggregate([{ $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } }]),
  ]);

  const rows = [];

  for (const dayShift of dayShifts) {
    const dayKey = new Date(dayShift.date).toISOString().split('T')[0];
    const dayTankEntries = tankEntries.filter((t) => new Date(t.date).toISOString().split('T')[0] === dayKey);
    const dayStockIns = stockIns.filter((s) => new Date(s.date).toISOString().split('T')[0] === dayKey);
    const daySales = sales.filter((s) => new Date(s.date).toISOString().split('T')[0] === dayKey);
    const dayReadings = readings.filter((r) => new Date(r.date).toISOString().split('T')[0] === dayKey);

    const salesByFuel = daySales.reduce((acc, item) => {
      acc[item.fuelType] = (acc[item.fuelType] || 0) + item.liters;
      return acc;
    }, {});

    const rttByFuel = dayReadings.reduce((acc, item) => {
      const fuelType = item.pumpLabel?.toUpperCase().includes('AGO') ? 'AGO' : 'PMS';
      acc[fuelType] = (acc[fuelType] || 0) + item.rtt;
      return acc;
    }, {});

    for (const tank of dayTankEntries) {
      const openingStock = tank.openingStock || 0;
      const stockIn = dayStockIns
        .flatMap((movement) => movement.distribution || [])
        .filter((d) => d.tankId === tank.tankId)
        .reduce((sum, d) => sum + d.litres, 0);

      const fuelType = tank.product;
      const salesLitres = (salesByFuel[fuelType] || 0) - (rttByFuel[fuelType] || 0);
      const priceForDay = dayShift.pricesAtStart?.[fuelType] || 0;
      const totalAmount = priceForDay * salesLitres;
      const closingStock = tank.closingStockManager ?? tank.closingStockMeasured ?? 0;
      const expectedClosing = openingStock + stockIn - salesLitres;
      const shortage = Math.max(0, expectedClosing - closingStock);
      const overage = Math.max(0, closingStock - expectedClosing);

      rows.push({
        date: dayKey,
        openingTime: dayShift.startTime ? new Date(dayShift.startTime).toLocaleTimeString('en-NG') : '-',
        openingStock,
        stockIn,
        overage,
        sales: salesLitres,
        priceForDay,
        totalAmount,
        shortage,
        closingStock,
        tankLabel: tank.tankLabel || tank.tankId,
      });
    }
  }

  return rows;
}

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 9 },
  title: { fontSize: 14, marginBottom: 10 },
  tableHeader: { flexDirection: 'row', borderBottom: 1, paddingBottom: 4, marginBottom: 4 },
  tableRow: { flexDirection: 'row', borderBottom: 0.5, paddingVertical: 2 },
  cell: { flex: 1 },
  cellWide: { flex: 1.5 },
});

function SummaryBookPdf({ rows }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, 'Daily Summary Book'),
      React.createElement(
        View,
        { style: styles.tableHeader },
        React.createElement(Text, { style: styles.cellWide }, 'Date'),
        React.createElement(Text, { style: styles.cell }, 'Opening'),
        React.createElement(Text, { style: styles.cell }, 'Stock In'),
        React.createElement(Text, { style: styles.cell }, 'Sales'),
        React.createElement(Text, { style: styles.cell }, 'Price'),
        React.createElement(Text, { style: styles.cell }, 'Amount'),
        React.createElement(Text, { style: styles.cell }, 'Shortage'),
        React.createElement(Text, { style: styles.cell }, 'Closing')
      ),
      ...rows.map((row, idx) =>
        React.createElement(
          View,
          { key: idx, style: styles.tableRow },
          React.createElement(Text, { style: styles.cellWide }, `${row.date} (${row.tankLabel})`),
          React.createElement(Text, { style: styles.cell }, String(row.openingStock.toFixed(2))),
          React.createElement(Text, { style: styles.cell }, String(row.stockIn.toFixed(2))),
          React.createElement(Text, { style: styles.cell }, String(row.sales.toFixed(2))),
          React.createElement(Text, { style: styles.cell }, String(row.priceForDay.toFixed(2))),
          React.createElement(Text, { style: styles.cell }, String(row.totalAmount.toFixed(2))),
          React.createElement(Text, { style: styles.cell }, String(row.shortage.toFixed(2))),
          React.createElement(Text, { style: styles.cell }, String(row.closingStock.toFixed(2)))
        )
      )
    )
  );
}

// GET /api/reports/summary-book/export?stationId=...&from=...&to=...&format=pdf|excel
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const from = searchParams.get('from');
    const to = searchParams.get('to') || from;
    const format = (searchParams.get('format') || 'excel').toLowerCase();

    if (!stationId || !from) {
      return NextResponse.json({ error: 'stationId and from are required' }, { status: 400 });
    }

    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const rows = await buildRows(stationId, from, to);

    if (format === 'excel') {
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet('Summary Book');

      sheet.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Opening Time', key: 'openingTime', width: 14 },
        { header: 'Opening Stock', key: 'openingStock', width: 14 },
        { header: 'Stock In', key: 'stockIn', width: 12 },
        { header: 'Overage', key: 'overage', width: 12 },
        { header: 'Sales', key: 'sales', width: 12 },
        { header: 'Price for the Day', key: 'priceForDay', width: 14 },
        { header: 'Total Amount', key: 'totalAmount', width: 14 },
        { header: 'Shortage', key: 'shortage', width: 12 },
        { header: 'Closing Stock', key: 'closingStock', width: 14 },
        { header: 'Tank', key: 'tankLabel', width: 14 },
      ];

      rows.forEach((row) => sheet.addRow(row));

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="summary-book-${from}-to-${to}.xlsx"`,
        },
      });
    }

    if (format === 'pdf') {
      const instance = pdf(SummaryBookPdf({ rows }));
      const pdfBuffer = await instance.toBuffer();

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="summary-book-${from}-to-${to}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: 'format must be pdf or excel' }, { status: 400 });
  } catch (error) {
    console.error('Error exporting summary book:', error);
    return NextResponse.json({ error: error.message || 'Failed to export summary book' }, { status: 500 });
  }
}
