"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import type { Db } from "@/db/client";
import { cancel, saveHandled, savePayment, saveStatus, type AdminResult } from "../admin";
import { adminAction } from "../auth";
import { logFailure } from "../log";

// Admin server actions: every export is wrapped in adminAction (signed-in admin or a redirect to /admin/login; the
// static check in tests/unit/admin-guards.test.ts fails otherwise). The work is in ../admin.ts. After a change the
// client router is refreshed, so the page, the overview numbers and the menu badges show the new state.

async function run(what: string, work: (db: Db) => Promise<AdminResult>): Promise<AdminResult> {
  try {
    const result = await work(getDb());
    if (result.ok) refresh();
    return result;
  } catch (e) {
    logFailure(`[admin] ${what} failed`, e);
    return { ok: false, error: "server" };
  }
}

/** Registration drawer, "Laekunud summa (€)": fields id, paid. For useActionState (previous state first). */
export const saveRegistrationPayment = adminAction(async (_admin, _prev: AdminResult | null, formData: FormData) =>
  run("payment", (db) => savePayment(db, formData)),
);

/** Registration drawer, status + note: fields id, status, note. */
export const saveRegistrationStatus = adminAction(async (_admin, _prev: AdminResult | null, formData: FormData) =>
  run("status", (db) => saveStatus(db, formData)),
);

/** Registration drawer, "Tühista registreerimine": field id. */
export const cancelRegistration = adminAction(async (_admin, _prev: AdminResult | null, formData: FormData) =>
  run("cancel", (db) => cancel(db, formData)),
);

/** Request inbox, "Märgi tehtuks" / "Märgi tegemata": fields id, handled ("1" | "0"). A plain form action. */
export const toggleRequestHandled = adminAction(async (_admin, formData: FormData): Promise<void> => {
  await run("request", (db) => saveHandled(db, formData));
});
