import { existsSync, readFileSync } from "node:fs";
import { applySeatFixtures, LOCAL_FIXTURES, removeAdminFixtures, removeAdminRows, removeEditRows, removeFormRows, restoreLeftoverCourses } from "./fixtures";

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
  refuseMailSecrets();
  await removeFormRows();
  await removeAdminRows(); // e2e-auth-… leftovers of an interrupted run
  await removeAdminFixtures(); // e2e-admin-… inbox fixtures of an interrupted run
  await restoreLeftoverCourses(); // seed courses an interrupted content test left changed
  await removeEditRows(); // its "E2E …" sessions and "e2e-uus-…" course
  await applySeatFixtures();
}

/**
 * The form tests submit to `next dev`, which must not e-mail or ping anyone: notifications are skipped there because
 * the dev environment has no RESEND_API_KEY / TELEGRAM_BOT_TOKEN. Stop before any test if someone has added them.
 */
function refuseMailSecrets(): void {
  const secret = /^\s*(RESEND_API_KEY|TELEGRAM_BOT_TOKEN)\s*=\s*\S/m;
  for (const file of [".dev.vars", ".env", ".env.local", ".env.development"]) {
    if (existsSync(file) && secret.test(readFileSync(file, "utf8")))
      throw new Error(`e2e: ${file} sets RESEND_API_KEY or TELEGRAM_BOT_TOKEN — the form tests would send real e-mails / Telegram messages`);
  }
  if (process.env.RESEND_API_KEY || process.env.TELEGRAM_BOT_TOKEN) throw new Error("e2e: RESEND_API_KEY / TELEGRAM_BOT_TOKEN is set in the environment");
}
