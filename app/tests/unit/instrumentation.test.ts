import { afterEach, describe, expect, test, vi } from "vitest";
import { register } from "@/instrumentation";

// Next.js calls register() when a server instance starts: in production a missing required variable fails the start
// with an error that names it (server/env.ts), instead of every request failing one by one.

const REQUIRED = ["DATABASE_URL", "SITE_URL", "ADMIN_EMAILS", "ADMIN_NAMES", "MARIA_EMAIL", "MAIL_FROM"];
const setAll = () => REQUIRED.forEach((name) => vi.stubEnv(name, name === "DATABASE_URL" ? "postgres://u:p@127.0.0.1:9/none" : "placeholder"));

afterEach(() => vi.unstubAllEnvs());

describe("register", () => {
  test("production without DATABASE_URL: the start fails and the error names the variable, not a value", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    setAll();
    vi.stubEnv("DATABASE_URL", "");
    const error = await register().then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toContain("DATABASE_URL");
    expect(error?.message).not.toContain("placeholder");
  });

  test("production with everything set starts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    setAll();
    await expect(register()).resolves.toBeUndefined();
  });

  test("outside production nothing is required (next dev, the tests)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    for (const name of REQUIRED) vi.stubEnv(name, "");
    await expect(register()).resolves.toBeUndefined();
  });

  test("the edge runtime (the proxy) does not check", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");
    for (const name of REQUIRED) vi.stubEnv(name, "");
    await expect(register()).resolves.toBeUndefined();
  });
});
