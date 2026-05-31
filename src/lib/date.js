/**
 * Returns today's date as YYYY-MM-DD in Nigerian time (WAT = UTC+1, Africa/Lagos).
 * Use this everywhere a "today" date string is needed on the client.
 * The station is always in Nigeria so operational dates must never depend on
 * the user's local timezone — a manager travelling abroad still sees Nigerian dates.
 */
export function todayNGT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

/**
 * Formats any Date object to YYYY-MM-DD in Nigerian time.
 */
export function toNGTDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(date);
}
