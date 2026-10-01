import type { Locale } from "@/i18n/locales";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatEUR(cents: number, _l: Locale): string {
  const euros = Math.floor(cents / 100);
  const centRemainder = cents % 100;

  // Group integer part by regular space every 3 digits
  const intStr = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  // Add decimals only when cents ≠ 0
  const decimalPart = centRemainder !== 0 ? `,${String(centRemainder).padStart(2, "0")}` : "";

  return `${intStr}${decimalPart} €`;
}

/** Largest amount the admin accepts as one payment (cents). Far above any course price, far below the int4 column. */
export const MAX_PAYMENT_CENTS = 100_000_000;

/**
 * A euro amount typed by the admin → cents, or null when it is not one. Accepts "175", "175,5", "175,50", "175.50",
 * "1 175" (spaces, also non-breaking ones) and a "€" sign; no negative amounts, at most two decimals.
 */
export function parseEuroCents(input: string): number | null {
  const s = input.replace(/[\s\u00A0\u202F€]/g, "");
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_PAYMENT_CENTS ? cents : null;
}

/** Cents → the value of the admin's amount field: "175" or "175,50". */
export function centsToInput(cents: number): string {
  const rest = cents % 100;
  return rest === 0 ? String(Math.floor(cents / 100)) : `${Math.floor(cents / 100)},${String(rest).padStart(2, "0")}`;
}
