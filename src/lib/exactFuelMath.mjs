function scaledInteger(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('A non-negative finite number is required.');
  const raw = String(value).trim().includes('e') ? number.toFixed(decimals + 6) : String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error('Invalid decimal number.');
  const fraction = match[2] || '';
  const base = BigInt(match[1]) * (10n ** BigInt(decimals));
  const retained = fraction.slice(0, decimals).padEnd(decimals, '0');
  const rounded = fraction[decimals] && fraction[decimals] >= '5' ? 1n : 0n;
  return base + BigInt(retained || 0) + rounded;
}

export function toKobo(value) {
  return scaledInteger(value, 2);
}

export function toMilliLitres(value) {
  return scaledInteger(value, 3);
}

export function fromKobo(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new Error('Money total exceeds the safe range.');
  return amount / 100;
}

export function fromMilliLitres(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new Error('Volume total exceeds the safe range.');
  return amount / 1000;
}

export function saleAmount(litres, pricePerLitre) {
  const milliLitres = toMilliLitres(litres);
  const priceTenThousandths = scaledInteger(pricePerLitre, 4);
  const kobo = (milliLitres * priceTenThousandths + 50000n) / 100000n;
  return fromKobo(kobo);
}
