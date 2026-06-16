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
import TankStockEntry from '@/models/TankStockEntry';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

function buildDateRange(from, to) {
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date((to || from) + 'T23:59:59.999Z');
  return { start, end };
}

async function buildRows(stationId, from, to) {
  const { start, end } = buildDateRange(from, to);
  const stationObjectId = new mongoose.Types.ObjectId(stationId);

  const [station, dayShifts, sales, stockIns, tankEntries] = await Promise.all([
    Station.findById(stationId).lean(),
    DayShift.aggregate([
      { $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } },
      { $sort: { date: 1 } },
    ]),
    SalesEntry.aggregate([{ $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } }]),
    StockMovement.aggregate([
      { $match: { stationId: stationObjectId, movementType: 'receipt', date: { $gte: start, $lte: end } } },
    ]),
    TankStockEntry.aggregate([{ $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } }]),
  ]);

  const pumpFuelTypeMap = {};
  const pumpTankMap = {};
  for (const d of (station?.dispensers || [])) {
    pumpFuelTypeMap[d.dispenserId] = d.fuelType;
    if (d.tankId) pumpTankMap[d.dispenserId] = d.tankId;
  }

  const tolerancePercent = station?.tolerancePercent ?? 0;
  const rows = [];

  for (const dayShift of dayShifts) {
    const dayKey = new Date(dayShift.date).toISOString().split('T')[0];

    const dayTankEntries = tankEntries.filter(
      (t) => new Date(t.date).toISOString().split('T')[0] === dayKey
    );
    const dayStockIns = stockIns.filter(
      (s) => new Date(s.date).toISOString().split('T')[0] === dayKey
    );
    const daySales = sales.filter(
      (s) => new Date(s.date).toISOString().split('T')[0] === dayKey
    );

    // Attribute sales to specific tanks using pump→tank mapping
    const salesByTank = {};
    const salesByFuelFallback = {};
    for (const sale of daySales) {
      const tankId = pumpTankMap[sale.dispenserId];
      if (tankId) {
        salesByTank[tankId] = (salesByTank[tankId] || 0) + sale.liters;
      } else {
        const ft = sale.fuelType || pumpFuelTypeMap[sale.dispenserId];
        if (ft) salesByFuelFallback[ft] = (salesByFuelFallback[ft] || 0) + sale.liters;
      }
    }

    // Deduplicate tank entries: prefer closing over opening per tank per day
    const productAgg = {};
    const entriesByTankPeriod = {};
    for (const t of dayTankEntries) {
      entriesByTankPeriod[`${t.tankId}:${t.period}`] = t;
    }
    const uniqueTankIds = [...new Set(dayTankEntries.map((t) => t.tankId))];
    for (const tankId of uniqueTankIds) {
      const closingEntry = entriesByTankPeriod[`${tankId}:closing`];
      const openingEntry = entriesByTankPeriod[`${tankId}:opening`];
      const entry = closingEntry || openingEntry;
      if (!entry) continue;
      const fuelType = entry.product;
      if (!productAgg[fuelType]) {
        productAgg[fuelType] = { openingStock: 0, stockIn: 0, closingStock: 0, sales: 0 };
      }
      productAgg[fuelType].openingStock += entry.openingStock || 0;
      productAgg[fuelType].stockIn += dayStockIns
        .flatMap((movement) => movement.distribution || [])
        .filter((d) => d.tankId === tankId)
        .reduce((sum, d) => sum + d.litres, 0);
      if (closingEntry) {
        productAgg[fuelType].closingStock +=
          closingEntry.closingStockManager ?? closingEntry.closingStockMeasured ?? 0;
      }
      productAgg[fuelType].sales += salesByTank[tankId] || 0;
    }
    for (const [ft, liters] of Object.entries(salesByFuelFallback)) {
      if (productAgg[ft]) productAgg[ft].sales += liters;
    }

    for (const [fuelType, agg] of Object.entries(productAgg)) {
      const salesLitres = agg.sales;
      const priceForDay = dayShift.pricesAtStart?.[fuelType] || 0;
      const totalAmount = priceForDay * salesLitres;
      const expectedClosing = agg.openingStock + agg.stockIn - salesLitres;
      const shortage = Math.max(0, expectedClosing - agg.closingStock);
      const overage = Math.max(0, agg.closingStock - expectedClosing);
      const expectedTolerance = salesLitres * (tolerancePercent / 100);

      rows.push({
        date: dayKey,
        openingTime: dayShift.startTime ? new Date(dayShift.startTime).toLocaleTimeString('en-NG') : '—',
        product: fuelType,
        openingStock: agg.openingStock,
        stockIn: agg.stockIn,
        overage,
        sales: salesLitres,
        priceForDay,
        totalAmount,
        shortage,
        closingStock: agg.closingStock,
        expectedTolerance,
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
          React.createElement(Text, { style: styles.cellWide }, `${row.date} (${row.product})`),
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
        { header: 'Product', key: 'product', width: 10 },
        { header: 'Opening Time', key: 'openingTime', width: 14 },
        { header: 'Opening Stock (L)', key: 'openingStock', width: 16 },
        { header: 'Stock In (L)', key: 'stockIn', width: 12 },
        { header: 'Sales (L)', key: 'sales', width: 12 },
        { header: 'Price/L (₦)', key: 'priceForDay', width: 14 },
        { header: 'Total Amount (₦)', key: 'totalAmount', width: 16 },
        { header: 'Overage (L)', key: 'overage', width: 12 },
        { header: 'Shortage (L)', key: 'shortage', width: 12 },
        { header: 'Exp. Tolerance (L)', key: 'expectedTolerance', width: 16 },
        { header: 'Closing Stock (L)', key: 'closingStock', width: 16 },
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
