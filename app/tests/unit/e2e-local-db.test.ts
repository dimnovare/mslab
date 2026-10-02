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

  test("collects E2E_DATABASE_URL and DATABASE_URL from the environment and from every env file the server reads", () => {
    const files: Record<string, string> = {
      ".env": 'SESSION_SECRET=x\nDATABASE_URL="postgres://u:p@db.example.com/x"\n',
      ".env.local": "# DATABASE_URL=postgres://u:p@commented.example/x\nexport DATABASE_URL=postgres://u:p@localhost:5432/mine\n",
      ".env.production": "DATABASE_URL=postgres://u:p@proxy.railway.example:5432/railway\n",
      ".env.production.local": "E2E_DATABASE_URL=postgres://u:p@127.0.0.1/e2e\n",
      // no longer read: wrangler's own files
      ".dev.vars": "DATABASE_URL=postgres://u:p@elsewhere.example/x\n",
      "wrangler.jsonc": '{ "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "x", "localConnectionString": "postgres://u:p@elsewhere.example/x" }] }',
    };
    const settings = databaseSettings({ E2E_DATABASE_URL: "postgres://a@localhost/x", DATABASE_URL: "postgres://a@rail.example/x" }, (f) => files[f] ?? null);
    expect(settings).toEqual([
      { source: "env E2E_DATABASE_URL", url: "postgres://a@localhost/x" },
      { source: "env DATABASE_URL", url: "postgres://a@rail.example/x" },
      { source: ".env DATABASE_URL", url: "postgres://u:p@db.example.com/x" },
      { source: ".env.local DATABASE_URL", url: "postgres://u:p@localhost:5432/mine" },
      { source: ".env.production DATABASE_URL", url: "postgres://u:p@proxy.railway.example:5432/railway" },
      { source: ".env.production.local E2E_DATABASE_URL", url: "postgres://u:p@127.0.0.1/e2e" },
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

  test("the env files are the ones `next dev` and `next start` read, and nothing reads wrangler.jsonc any more", () => {
    const read: string[] = [];
    databaseSettings({}, (f) => (read.push(f), null));
    expect(read).toEqual([".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]);
  });
});
