"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Db } from "@/db/client";
import { addClientForm, grantAccessForm, revokeAccessForm, unlockNextForm, type ClientResult } from "../admin-clients";
import { adminAction } from "../auth";
import { logFailure } from "../log";

// Õpilased (the admin's students) server actions: every export is wrapped in adminAction (signed-in admin or a redirect to
// /admin/login; tests/unit/admin-guards.test.ts fails otherwise). The work is in ../admin-clients.ts. Any admin may grant
// and end e-course access and open a student's next lesson; the grant and the opening record the admin's address. Nothing
// here shows on a public page (access and progress are read only through the student's own account JSON), so no page is
// revalidated; refresh() updates the open admin page.

async function run(what: string, work: (db: Db) => Promise<ClientResult>): Promise<ClientResult> {
  try {
    const result = await work(getDb());
    if (result.ok) refresh();
    return result;
  } catch (e) {
    logFailure(`[admin] ${what} failed`, e);
    return { ok: false, error: "server" };
  }
}

/** "Lisa õpilane": field email. Opens the student's drawer (a new or an existing one), where "Ava ligipääs" is. */
export const addStudent = adminAction(async (_admin, _prev: ClientResult | null, formData: FormData) => {
  const result = await run("add student", (db) => addClientForm(db, formData));
  if (result.ok && result.id) redirect(`/admin/opilased?id=${result.id}`);
  return result;
});

/** Drawer, "Ava ligipääs": fields clientId, courseId, until (yyyy-mm-dd, Estonian date). */
export const grantCourseAccess = adminAction(async ({ email }, _prev: ClientResult | null, formData: FormData) =>
  run("grant access", (db) => grantAccessForm(db, formData, email, new Date())),
);

/** Drawer, "Lõpeta ligipääs" (after its confirmation): fields clientId, accessId. */
export const revokeCourseAccess = adminAction(async (_admin, _prev: ClientResult | null, formData: FormData) =>
  run("revoke access", (db) => revokeAccessForm(db, formData, new Date())),
);

/** Drawer, "Ava järgmine õppetund" (after its confirmation): fields clientId, courseId, lessonId. The admin's e-mail is recorded. */
export const unlockNextLesson = adminAction(async ({ email }, _prev: ClientResult | null, formData: FormData) =>
  run("unlock lesson", (db) => unlockNextForm(db, formData, email, new Date())),
);
