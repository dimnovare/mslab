// CSV for the admin exports (RFC 4180: comma separated, CRLF line ends, quotes doubled), with a UTF-8 byte order
// mark so Excel reads õ, ä, ö, ü and Cyrillic correctly.
//
// CSV injection: a spreadsheet runs a cell that starts with = + - @ (or a tab / carriage return, which some read past)
// as a formula. Such cells get a leading apostrophe, so they are shown as text. The values come from visitors
// (e-mail addresses, names), so this matters even though the forms validate them.

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: formula-like text defused, quoted when it holds a comma, quote, semicolon, line break or edge spaces. */
export function csvCell(value: CsvValue): string {
  let s = value == null ? "" : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",;\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A whole file: header and rows, BOM first, every line ending in CRLF. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
