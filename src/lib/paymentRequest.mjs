export function paymentRequestFingerprint({ dayShiftId, dispenserId, cashReceived, posEntries }) {
  return JSON.stringify({
    dayShiftId: String(dayShiftId),
    dispenserId: String(dispenserId),
    cashKobo: Math.round(Number(cashReceived) * 100),
    pos: (posEntries || []).map((entry) => ({
      bank: String(entry.bank).trim(),
      amountKobo: Math.round(Number(entry.amount) * 100),
      terminalId: entry.terminalId?.trim() || null,
    })),
  });
}
