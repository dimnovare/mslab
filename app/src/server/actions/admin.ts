"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import type { Db } from "@/db/client";
import { cancel, saveHandled, savePayment, saveStatus, type AdminResult } from "../admin";
import { adminAction } from "../auth";
import { logFailure } from "../log";
import { revalidatePublic, type PublicChange } from "../public-cache";

// Admin server actions: every export is wrapped in adminAction (signed-in admin or a redirect to /admin/login; the
// static check in tests/unit/admin-guards.test.ts fails otherwise). The work is in ../admin.ts. After a change the
// client router is refreshed, so the page, the overview numbers and the menu badges show the new state. A registration's
// status counts towards the seats shown on the public calendar and course pages: those are revalidated
// (server/public-cache.ts).

async function run(what: string, change: PublicChange | null, work: (db: Db) => Promise<AdminResult>): Promise<AdminResult> {
  try {
    const result = await work(getDb());
    if (result.ok && change) revalidatePublic(change);
    // stale: nothing was saved, but the page must show what is stored now
    if (result.ok || result.error === "stale") refresh();
    return result;
  } catch (e) {
    logFailure(`[admin] ${what} failed`, e);
    return { ok: false, error: "server" };
  }
}

/** Registration drawer, "Laekunud summa (€)": fields id, paid. For useActionState (previous state first). */
export const saveRegistrationPayment = adminAction(async (_admin, _prev: AdminResult | null, formData: FormData) =>
  run("payment", { kind: "seats" }, (db) => savePayment(db, formData)),
);

/** Registration drawer, status + note: fields id, status, note, expected (the status the form showed). */
export const saveRegistrationStatus = adminAction(async (_admin, _prev: AdminResult | null, formData: FormData) =>
  run("status", { kind: "seats" }, (db) => saveStatus(db, formData)),
);

/** Registration drawer, "Tühista registreerimine": field id. */
export const cancelRegistration = adminAction(async (_admin, _prev: AdminResult | null, formData: FormData) =>
  run("cancel", { kind: "seats" }, (db) => cancel(db, formData)),
);

/** Request inbox, "Märgi tehtuks" / "Märgi tegemata": fields id, handled ("1" | "0"). */
export const toggleRequestHandled = adminAction(async (_admin, _prev: AdminResult | null, formData: FormData) =>
  run("request", null, (db) => saveHandled(db, formData)),
);
