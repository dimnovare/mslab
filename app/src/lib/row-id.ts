// One parser for the ids this app reads from text: a form field, an address segment, a query value. Client-safe (no server
// imports), so the admin forms, the account API, the routing and the pages all read an id the same way.

/** The largest id the database's integer columns (serial) hold. */
export const ROW_ID_MAX = 2_147_483_647;

/** A row id written as digits, without a leading zero, from 1 to ROW_ID_MAX; null for anything else (a sign, a space, a fraction, letters). */
export function parseRowId(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= ROW_ID_MAX ? n : null;
}
