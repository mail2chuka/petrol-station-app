export function calculateShiftSummary(sales, payments) {
  const totalSales = {};
  const byPump = {};
  for (const sale of sales) {
    const liters = Number(sale.liters) || 0;
    const amount = Number(sale.expectedAmount) || 0;
    const product = totalSales[sale.fuelType] || { liters: 0, amount: 0 };
    product.liters += liters;
    product.amount += amount;
    totalSales[sale.fuelType] = product;
    const pump = byPump[sale.dispenserId] || { liters: 0, expected: 0, collected: 0 };
    pump.liters += liters;
    pump.expected += amount;
    byPump[sale.dispenserId] = pump;
  }

  let cash = 0;
  let pos = 0;
  for (const payment of payments) {
    cash += Number(payment.cashReceived) || 0;
    pos += Number(payment.posReceived) || 0;
    if (byPump[payment.dispenserId]) {
      byPump[payment.dispenserId].collected += Number(payment.totalReceived) || 0;
    }
  }

  const expectedAmount = Object.values(totalSales).reduce((sum, product) => sum + product.amount, 0);
  const actualAmount = cash + pos;
  const unroundedOutstanding = Object.values(byPump).reduce((sum, pump) => (
    pump.liters > 0 ? sum + Math.max(0, pump.expected - pump.collected) : sum
  ), 0);
  const collectionOutstanding = Math.round(unroundedOutstanding * 100) / 100;

  return {
    totalSales,
    totalPayments: { cash, pos },
    expectedAmount,
    actualAmount,
    discrepancy: actualAmount - expectedAmount,
    collectionOutstanding,
    collectionStatus: collectionOutstanding > 0 ? 'pending' : 'settled',
  };
}
