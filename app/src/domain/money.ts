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
