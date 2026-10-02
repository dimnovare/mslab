import { existsSync, readFileSync } from "node:fs";
import { applySeatFixtures, LOCAL_FIXTURES, scheduleSampleSessions, removeAdminFixtures, removeAdminRows, removeEditRows, removeFormRows, removePostRows, restoreLeftoverCourses, restoreLeftoverRows } from "./fixtures";
import { forbiddenSettingError } from "../local-secrets";
import { assertLocalUpstream } from "./local-cache";
import { assertLocalDatabases } from "./local-db";
import { removeLeftoverComments } from "./local-kv";

// Runs once per `playwright test` run (whatever the file or --grep filter): seat fixtures for the calendar tests, and
// leftovers of an interrupted run's form submissions removed.
export default async function globalSetup(): Promise<void> {
  if (!LOCAL_FIXTURES) {
    // A deployment has a real database and real notifications. Read-only runs against it need an explicit opt-in;
    // even then the form tests skip themselves and every POST is blocked (tests/e2e/test.ts).
    if (process.env.E2E_ALLOW_REMOTE !== "1")
      throw new Error("e2e: E2E_BASE_URL is not a local server — set E2E_ALLOW_REMOTE=1 for a read-only run (form tests are skipped)");
    return;
  }
  refuseForbiddenSettings();
  assertLocalDatabases(); // before any write: the fixtures' database and the dev server's are both on this machine
  await assertLocalUpstream(); // the local production build believes it is localhost, never the live domain
  await removeFormRows();
  await removeAdminRows(); // e2e-auth-… leftovers of an interrupted run
  await removeAdminFixtures(); // e2e-admin-… inbox fixtures of an interrupted run
  await restoreLeftoverCourses(); // seed courses an interrupted content test left changed
  await restoreLeftoverRows(); // site content (slides, packages, pages, settings …) it left changed
  await removePostRows(); // and the posts the site editor tests made
  await removeEditRows(); // its "E2E …" sessions and "e2e-uus-…" course
  await removeLeftoverComments(); // review comments (dev server's local KV) of an interrupted feedback test
  await scheduleSampleSessions(); // the sample sessions on today's schedule: the calendar never runs out of dates
  await applySeatFixtures();
}

/**
 * The form tests submit to `next dev`, which must not e-mail or ping anyone: notifications are skipped there because
 * the dev environment has no RESEND_API_KEY / TELEGRAM_BOT_TOKEN. The upload tests must not reach the real image bucket
 * either: with no R2_* variable `next dev` keeps images in a local folder. Stop before any test if someone has added
 * one of them (tests/local-secrets.ts, FORBIDDEN_SETTINGS).
 */
function refuseForbiddenSettings(): void {
  const files: Record<string, string | undefined> = {};
  for (const file of [".dev.vars", ".env", ".env.local", ".env.development", ".env.development.local"]) files[file] = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const problem = forbiddenSettingError(files, process.env);
  if (problem) throw new Error(problem);
}
