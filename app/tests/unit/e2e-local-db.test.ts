import { describe, expect, test } from "vitest";
import { assertLocalDatabases, databaseSettings, isLocalDbUrl } from "../e2e/local-db";

// The e2e run refuses to write to any database that is not on this machine (Task 16 item 3).

describe("e2e local database guard", () => {
  test("only localhost, 127.0.0.1 and ::1 count as local", () => {
    for (const url of ["postgres://postgres:postgres@localhost:5432/mslab", "postgresql://u:p@127.0.0.1/db", "postgres://u:p@[::1]:5432/db", "postgres://u:p@LOCALHOST/db"])
      expect(isLocalDbUrl(url), url).toBe(true);
    for (const url of ["postgres://u:p@proxy.railway.example:5432/railway", "postgres://u:p@10.0.0.5/db", "postgres://u:p@localhost.evil.example/db", "not a url", ""])
      expect(isLocalDbUrl(url), url).toBe(false);
  });

  test("collects E2E_DATABASE_URL, DATABASE_URL, the Hyperdrive local overrides, env files and wrangler.jsonc", () => {
    const files: Record<string, string> = {
      ".dev.vars": 'SESSION_SECRET=x\nCLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://u:p@db.example.com/x"\n',
      "wrangler.jsonc": '{ "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "x", "localConnectionString": "postgres://postgres:postgres@localhost:5432/mslab" }] }',
    };
    const settings = databaseSettings({ E2E_DATABASE_URL: "postgres://a@localhost/x", DATABASE_URL: "postgres://a@rail.example/x" }, (f) => files[f] ?? null);
    expect(settings.map((s) => s.source)).toEqual([
      "env E2E_DATABASE_URL",
      "env DATABASE_URL",
      ".dev.vars CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE",
      "wrangler.jsonc localConnectionString",
    ]);
  });

  test("refuses a remote setting by name and host, without the password", () => {
    expect(() => assertLocalDatabases([{ source: "env E2E_DATABASE_URL", url: "postgres://a@localhost/x" }])).not.toThrow();
    expect(() => assertLocalDatabases([])).not.toThrow();
    let message = "";
    try {
      assertLocalDatabases([
        { source: "env E2E_DATABASE_URL", url: "postgres://a@localhost/x" },
        { source: "env DATABASE_URL", url: "postgres://user:s3cret@proxy.railway.example:5432/railway" },
      ]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("refusing to run against a non-local database");
    expect(message).toContain("env DATABASE_URL → proxy.railway.example");
    expect(message).not.toContain("s3cret");
    expect(message).not.toContain("user:");
  });

  test("this repository's own settings are local (wrangler.jsonc's localConnectionString)", () => {
    expect(databaseSettings({}).some((s) => s.source === "wrangler.jsonc localConnectionString")).toBe(true);
    expect(() => assertLocalDatabases(databaseSettings({}))).not.toThrow();
  });
});
