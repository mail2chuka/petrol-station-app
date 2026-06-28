// Shared helpers for extracting optional HR profile fields from a request body,
// with safe coercion (empty date strings → null so Mongoose doesn't choke).

const TEXT_KEYS_USER = ['phone', 'address', 'gender', 'photoUrl', 'position', 'employeeId', 'employmentType'];
const TEXT_KEYS_ATTENDANT = ['phone', 'address', 'gender', 'photoUrl', 'position', 'employmentType'];
const DATE_KEYS = ['dateOfBirth', 'employmentDate'];

function coerceDate(v) {
  if (v === undefined) return undefined;
  if (!v) return null; // '' or null → clear the field
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pick(body, textKeys) {
  const out = {};
  for (const k of textKeys) {
    if (body[k] !== undefined) out[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
  }
  for (const k of DATE_KEYS) {
    const v = coerceDate(body[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function extractUserHrFields(body) {
  return pick(body, TEXT_KEYS_USER);
}

export function extractAttendantHrFields(body) {
  return pick(body, TEXT_KEYS_ATTENDANT);
}
