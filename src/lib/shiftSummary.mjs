import { fromKobo, fromMilliLitres, toKobo, toMilliLitres } from './exactFuelMath.mjs';

export function calculateShiftSummary(sales, payments) {
  const productTotals = {};
  const byPump = {};
  for (const sale of sales) {
    const liters = toMilliLitres(sale.liters);
    const amount = toKobo(sale.expectedAmount);
    const product = productTotals[sale.fuelType] || { liters: 0n, amount: 0n };
    product.liters += liters;
    product.amount += amount;
    productTotals[sale.fuelType] = product;
    const pump = byPump[sale.dispenserId] || { liters: 0n, expected: 0n, collected: 0n };
    pump.liters += liters;
    pump.expected += amount;
    byPump[sale.dispenserId] = pump;
  }

  let cash = 0n;
  let pos = 0n;
  for (const payment of payments) {
    cash += toKobo(payment.cashReceived);
    pos += toKobo(payment.posReceived);
    if (byPump[payment.dispenserId]) {
      byPump[payment.dispenserId].collected += toKobo(payment.totalReceived);
    }
  }

  const totalSales = Object.fromEntries(Object.entries(productTotals).map(([fuelType, totals]) => [
    fuelType, { liters: fromMilliLitres(totals.liters), amount: fromKobo(totals.amount) },
  ]));
  const expectedKobo = Object.values(productTotals).reduce((sum, product) => sum + product.amount, 0n);
  const actualKobo = cash + pos;
  const outstandingKobo = Object.values(byPump).reduce((sum, pump) => (
    pump.liters > 0n && pump.expected > pump.collected ? sum + pump.expected - pump.collected : sum
  ), 0n);

  return {
    totalSales,
    totalPayments: { cash: fromKobo(cash), pos: fromKobo(pos) },
    expectedAmount: fromKobo(expectedKobo),
    actualAmount: fromKobo(actualKobo),
    discrepancy: fromKobo(actualKobo - expectedKobo),
    collectionOutstanding: fromKobo(outstandingKobo),
    collectionStatus: outstandingKobo > 0n ? 'pending' : 'settled',
  };
}
