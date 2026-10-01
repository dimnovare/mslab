import { z } from "zod";
import type { Db } from "@/db/client";
import type { Subscriber } from "@/db/schema";
import { getRegistration, recordRegistrationPayment, setRegistrationStatus, setRequestHandled } from "@/db/queries/admin";
import { parseEuroCents } from "@/domain/money";
import { NOTE_MAX } from "@/domain/registration";
import { adminEt } from "@/i18n/dict/admin";
import { formatStamp } from "@/i18n/format";
import { toCsv } from "./csv";

// The admin inbox's form handling (registrations, requests) and the subscriber export. Callers have already checked
// the admin session (server/actions/admin.ts wraps each in adminAction, the CSV route is wrapped in withAdmin); these
// take a Db and run without Next.js (tests/db/admin.test.ts).

/**
 * What an admin form gets back. `error`: invalid (bad id / status), notFound, amount (not a euro amount), note (too
 * long), stale (the status changed since the form was loaded: nothing saved, the page shows the current one).
 */
export type AdminResult = { ok: true } | { ok: false; error: "invalid" | "notFound" | "amount" | "note" | "stale" | "server" };

const OK: AdminResult = { ok: true };
const fail = (error: Exclude<AdminResult, { ok: true }>["error"]): AdminResult => ({ ok: false, error });

const id = z.coerce.number().int().positive().max(2_147_483_647);
const status = z.enum(["awaiting_prepayment", "confirmed", "cancelled"]);

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : null;
};

/** Fields: id, paid (euros as typed: "175", "175,50"). Stores the amount and recomputes the status from it. */
export async function savePayment(db: Db, formData: FormData): Promise<AdminResult> {
  const reg = id.safeParse(field(formData, "id"));
  if (!reg.success) return fail("invalid");
  const cents = parseEuroCents(field(formData, "paid") ?? "");
  if (cents === null) return fail("amount");
  return (await recordRegistrationPayment(db, reg.data, cents)) ? OK : fail("notFound");
}

/**
 * Fields: id, status (awaiting_prepayment | confirmed | cancelled), note (at most NOTE_MAX characters), expected (the
 * status the form was showing). Maria's manual change; refused as `stale` when the stored status is no longer
 * `expected` (e.g. cancelled or confirmed by a payment in another tab), so it never overwrites a change she did not see.
 */
export async function saveStatus(db: Db, formData: FormData): Promise<AdminResult> {
  const reg = id.safeParse(field(formData, "id"));
  const next = status.safeParse(field(formData, "status"));
  const expected = status.safeParse(field(formData, "expected"));
  if (!reg.success || !next.success || !expected.success) return fail("invalid");
  const note = (field(formData, "note") ?? "").trim();
  if (note.length > NOTE_MAX) return fail("note");
  if (await setRegistrationStatus(db, reg.data, next.data, note, { expected: expected.data })) return OK;
  return (await getRegistration(db, reg.data)) ? fail("stale") : fail("notFound");
}

/** Field: id. "Tühista": status cancelled, the note is kept. */
export async function cancel(db: Db, formData: FormData): Promise<AdminResult> {
  const reg = id.safeParse(field(formData, "id"));
  if (!reg.success) return fail("invalid");
  return (await setRegistrationStatus(db, reg.data, "cancelled")) ? OK : fail("notFound");
}

/** Fields: id, handled ("1" = done, "0" = not done). */
export async function saveHandled(db: Db, formData: FormData): Promise<AdminResult> {
  const req = id.safeParse(field(formData, "id"));
  const handled = field(formData, "handled");
  if (!req.success || (handled !== "1" && handled !== "0")) return fail("invalid");
  return (await setRequestHandled(db, req.data, handled === "1")) ? OK : fail("notFound");
}

/** The subscriber export: e-mail, locale, consent time, confirmed yes/no, confirmation time (Estonian time). */
export function subscribersCsv(rows: Subscriber[], opts: { confirmedOnly: boolean }): string {
  const t = adminEt.newsletter.csv;
  const list = opts.confirmedOnly ? rows.filter((r) => r.confirmedAt) : rows;
  return toCsv(
    t.header,
    list.map((r) => [r.email, r.locale.toUpperCase(), formatStamp(r.consentAt), r.confirmedAt ? t.yes : t.no, r.confirmedAt ? formatStamp(r.confirmedAt) : ""]),
  );
}

/** "mslab-uudiskiri-2026-10-01.csv" / "mslab-uudiskiri-kinnitatud-2026-10-01.csv" (Estonian date). */
export function subscribersCsvName(now: Date, confirmedOnly: boolean): string {
  const t = adminEt.newsletter.csv;
  return `${confirmedOnly ? t.filenameConfirmed : t.filename}-${formatStamp(now).slice(0, 10)}.csv`;
}
