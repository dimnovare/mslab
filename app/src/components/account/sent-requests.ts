import type { AccountCard, ContactCard } from "@/domain/account-cards";

// The registrations this browser tab has sent "Tühista või muuda aega" for, kept in sessionStorage so that the card still
// says "Saadetud. Maria võtab sinuga ühendust." after a reload, instead of offering the button again. Each entry is
// `{ id, startsAt, at }`: the registration, the session date it was sent about and when. It counts only while the card is
// still about that date (Maria may have moved the registration to another one: then the student can ask again) and for
// 24 hours. Per tab; "Logi välja" forgets them; blocked storage simply keeps nothing.

export const SENT_KEY = "mslab-change-sent";

/** How long a sent request keeps the button away. */
export const SENT_TTL_MS = 24 * 60 * 60 * 1000;

export type SentRequest = { id: number; startsAt: string; at: number };

const isEntry = (v: unknown): v is SentRequest => {
  const e = v as SentRequest | null;
  return !!e && typeof e === "object" && Number.isInteger(e.id) && typeof e.startsAt === "string" && typeof e.at === "number" && Number.isFinite(e.at);
};

const fresh = (now: number) => (e: SentRequest) => now - e.at < SENT_TTL_MS;

function read(): SentRequest[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function write(list: SentRequest[]): void {
  try {
    if (list.length) sessionStorage.setItem(SENT_KEY, JSON.stringify(list));
    else sessionStorage.removeItem(SENT_KEY);
  } catch {
    // private mode or blocked storage: the card shows "Saadetud" until the page is loaded again
  }
}

/** The requests sent from this tab in the last 24 hours ([] when none, or storage is blocked or holds something else). */
export function sentChangeRequests(now: number = Date.now()): SentRequest[] {
  return read().filter(fresh(now));
}

/**
 * Remembers that a request was sent for this registration's session (replacing an older one for it) and returns the
 * entry: the page keeps it in its own state, so "Saadetud" shows even when storage is blocked or full (storage only
 * carries it over a reload).
 */
export function rememberChangeRequest(card: ContactCard, now: number = Date.now()): SentRequest {
  const entry: SentRequest = { id: card.registrationId, startsAt: card.session.startsAt, at: now };
  write([...read().filter((e) => e.id !== card.registrationId && fresh(now)(e)), entry]);
  return entry;
}

/** Was a request sent from this tab about this card, as it is now (the same registration and the same session date)? */
export function isSent(list: SentRequest[], card: AccountCard): boolean {
  return card.kind === "contact" && list.some((e) => e.id === card.registrationId && e.startsAt === card.session.startsAt);
}

/** Drops what no longer counts: older than 24 hours, or about a registration that is gone or now on another date. */
export function pruneChangeRequests(cards: AccountCard[], now: number = Date.now()): void {
  const before = read();
  const kept = before.filter((e) => fresh(now)(e) && cards.some((card) => card.kind === "contact" && isSent([e], card)));
  if (kept.length !== before.length) write(kept);
}

/** Forgets every sent request (logging out). */
export function forgetChangeRequests(): void {
  write([]);
}
