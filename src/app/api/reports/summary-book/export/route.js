import { NextResponse } from 'next/server';
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
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { buildSummaryBookRows } from '@/lib/summaryBookRows';

// Same aggregation the on-screen summary book uses (one row per shift per
// product, correctly scoped so multi-shift days don't blend into one row or
// leak between shifts) — just sorted chronologically, since a printed ledger
// reads start-to-end rather than newest-first like the on-screen list.
async function buildRows(stationId, from, to) {
  const { rows } = await buildSummaryBookRows(stationId, from, to);
  rows.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 :
    (a.shiftOrder || 1) - (b.shiftOrder || 1) ||
    a.product.localeCompare(b.product)
  );
  return rows.map((row) => ({
    ...row,
    openingTime: row.openingTime ? new Date(row.openingTime).toLocaleTimeString('en-NG') : '—',
  }));
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
          React.createElement(Text, { style: styles.cellWide }, `${row.date} · ${row.shiftLabel} (${row.product})`),
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
        { header: 'Shift', key: 'shiftLabel', width: 14 },
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
