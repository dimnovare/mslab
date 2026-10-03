import { randomBytes, randomInt } from "node:crypto";
import type { Page } from "@playwright/test";
import { onLocalDb, sha256Hex } from "./fixtures";
import { LOCAL_URL, PROD_BUILD, TARGET } from "./target";
import { expect } from "./test";

// Signing in to the client account in the e2e tests (local dev server or the local production build only).
//
// Every address is `e2e-client-<label>-<project>@example.test` (clientEmail): a sample address, so nothing is ever mailed,
// and global-setup / global-teardown remove its rows (fixtures.ts removeClientRows). A login row is what
// server/client-auth.ts issueClientLogin stores: the SHA-256 of a random link token, the SHA-256 of `${hash}:${code}` for
// the 6-digit code, the address and 30 minutes.

/** A client login's lifetime (server/client-auth.ts LOGIN_TTL_MS). */
const LOGIN_TTL_MS = 30 * 60_000;

/** The test address of one test: e2e-client-<label>-<project>@example.test (lowercase). */
export function clientEmail(label: string, project: string): string {
  return `e2e-client-${label}-${project}@example.test`.toLowerCase();
}

/** Stores a live login for `email` (in the LOCAL database) with this link token and code, as issueClientLogin would. */
async function storeLogin(email: string, token: string, code: string): Promise<void> {
  const hash = sha256Hex(token);
  await onLocalDb(
    (sql) => sql`insert into client_login_tokens (hash, code_hash, email, expires_at)
                 values (${hash}, ${sha256Hex(`${hash}:${code}`)}, ${email}, ${new Date(Date.now() + LOGIN_TTL_MS)})`,
  );
}

const sixDigits = () => String(randomInt(1_000_000)).padStart(6, "0");

/**
 * Signs `page` in as `email` through the login link: a login stored straight in the local database, then the app's own
 * /api/konto/verify uses it, starts the session (ending any other of this client: one device only) and opens /konto.
 * The same against `next dev` and the local production build (which never hands out a code or link).
 */
export async function signInAsClient(page: Page, email: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await storeLogin(email, token, sixDigits());
  await page.goto(`/api/konto/verify?t=${token}`);
  await expect(page).toHaveURL(/\/konto$/);
  expect((await page.context().cookies()).some((c) => c.name === "__Host-mslab_client"), "session cookie").toBe(true);
}

/**
 * A code that signs `email` in, for the code-entry tests. Against `next dev` it is the `devCode` of a POST /api/konto/login
 * (asked as a visitor of its own: the login limit counts 10 per visitor IP in 10 minutes). The production build never
 * returns one, so there a live login with a code chosen here is stored (the code of the form's own login stays unknown;
 * every live login of the address is tried).
 */
export async function knownLoginCode(email: string): Promise<string> {
  if (PROD_BUILD) {
    const code = sixDigits();
    await storeLogin(email, randomBytes(32).toString("base64url"), code);
    return code;
  }
  const res = await fetch(`${TARGET || LOCAL_URL}/api/konto/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `e2e-code-${Date.now().toString(36)}${randomBytes(3).toString("hex")}` },
    body: JSON.stringify({ email, locale: "et" }),
  });
  expect(res.status, "POST /api/konto/login").toBe(200);
  const { devCode } = (await res.json()) as { devCode?: string };
  expect(devCode, "devCode in the local answer (at most 3 live logins per address)").toMatch(/^\d{6}$/);
  return devCode!;
}

/** Makes every live login of `email` expire a minute ago (the 30 minutes cannot be waited out). */
export async function expireLogins(email: string): Promise<void> {
  await onLocalDb((sql) => sql`update client_login_tokens set expires_at = now() - interval '1 minute' where email = ${email} and used_at is null`);
}
