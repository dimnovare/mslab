import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

// Static check: no test asks for a login link for Maria's address. The e2e tests run against a local dev server that is
// not supposed to e-mail anybody, but if one ever ran with a Resend key, a login request for her address would put a
// real link in her inbox. So the tests sign in as Dim only (tests/e2e/admin-login.ts), and the unit tests use a
// stand-in second admin. Her address may appear only where it is data, never a login: an allow-list string, the
// greeting name, and the admin list the settings page shows.

const TESTS = join(process.cwd(), "tests");
const MARIA = /maria@example\.test/i;

/** Lines that only use the address as data. */
const ALLOWED = [
  /isAllowedAdmin\(/, // allow-list checks
  /adminFirstName\(/, // the greeting name
  /=\s*"[^"]*dim@example\.test\s*,\s*maria@example\.test[^"]*"/i, // an allow-list string ("a,b")
  /toHaveText\(\["dim@example\.test", "maria@example\.test"\]\)/, // Seaded shows ADMIN_EMAILS read-only
];
/** Anything that asks for, makes or uses a login (link, token, session) or signs in. */
const LOGIN = /auth\/request|handleLoginRequest|LoginToken|createSession|signIn|requestLink|submitLogin|devLink|\bADMIN\s*=|email:\s*["'`]/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx|mjs|js)$/.test(e.name) ? [join(dir, e.name)] : []));
}

/** The lines of a file that break the rule: "<file>:<line>: <text>". */
export function offending(path: string, source: string): string[] {
  return source.split(/\r?\n/).flatMap((line, i) => (MARIA.test(line) && (LOGIN.test(line) || !ALLOWED.some((r) => r.test(line))) ? [`${path}:${i + 1}: ${line.trim()}`] : []));
}

describe("no test asks for a login link for Maria's address", () => {
  test("every file under tests/", () => {
    const self = join(TESTS, "unit", "test-addresses.test.ts");
    const files = walk(TESTS).filter((f) => f !== self);
    expect(files.length).toBeGreaterThan(30); // the check is not vacuous
    const broken = files.flatMap((f) => offending(relative(process.cwd(), f).replace(/\\/g, "/"), readFileSync(f, "utf8")));
    expect(broken).toEqual([]);
  });

  test("the rule catches a login for her and allows her address as data", () => {
    expect(offending("x.ts", `const ADMIN = "maria@example.test";`)).toHaveLength(1);
    expect(offending("x.ts", `await page.request.post("/api/auth/request", { data: { email: "maria@example.test" } });`)).toHaveLength(1);
    expect(offending("x.ts", `await requestLink(page, "maria@example.test");`)).toHaveLength(1);
    expect(offending("x.ts", `["maria@example.test", "Maria"],`)).toHaveLength(1);
    expect(offending("x.ts", `await handleLoginRequest(deps, { email: "maria@example.test" });`)).toHaveLength(1);
    expect(offending("x.ts", `expect(await issueLoginToken(db, "maria@example.test", now)).not.toBeNull();`)).toHaveLength(1);
    expect(offending("x.ts", `expect(isAllowedAdmin(" maria@example.test ", allow)).toBe(true);`)).toEqual([]);
    expect(offending("x.ts", `expect(adminFirstName("maria@example.test")).toBe("Maria");`)).toEqual([]);
    expect(offending("x.ts", `const ALLOW = "dim@example.test,maria@example.test";`)).toEqual([]);
    expect(offending("x.ts", `const ALLOW = "dim@example.test,example@x.ee";`)).toEqual([]);
  });
});
