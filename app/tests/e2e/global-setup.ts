import { existsSync, readFileSync } from "node:fs";
import { applySeatFixtures, LOCAL_FIXTURES, removeFormRows } from "./fixtures";

// Runs once per `playwright test` run (whatever the file or --grep filter): seat fixtures for the calendar tests, and
// leftovers of an interrupted run's form submissions removed.
export default async function globalSetup(): Promise<void> {
  if (!LOCAL_FIXTURES) return;
  refuseMailSecrets();
  await removeFormRows();
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
