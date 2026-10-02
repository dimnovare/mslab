import { describe, expect, test } from "vitest";
import { seedRefusal } from "@/db/seed";

// src/db/seed.ts (final review M7): --reset deletes the content tables and the registrations, so the seed says which
// database it means, and the address must agree, as fill-ru.ts does.

const LOCAL = "postgres://postgres:postgres@localhost:5432/mslab";
const RAILWAY = "postgres://u:p@x.proxy.rlwy.net:123/railway";
const OTHER = "postgres://u:p@db.example.com:5432/x";

describe("seed target guard", () => {
  test("--reset needs --target, and the target must agree with the address", () => {
    expect(seedRefusal(LOCAL, ["--reset"])).toMatch(/without --target/);
    expect(seedRefusal(RAILWAY, ["--reset", "--force"])).toMatch(/without --target/);
    expect(seedRefusal(RAILWAY, ["--reset", "--force", "--target", "local"])).toMatch(/not a local database/);
    expect(seedRefusal(LOCAL, ["--reset", "--target", "railway"])).toMatch(/not a Railway database/);
    expect(seedRefusal(OTHER, ["--reset", "--force", "--target", "railway"])).toMatch(/not a Railway database/);
    expect(seedRefusal(LOCAL, ["--reset", "--force", "--target", "local"])).toBeNull();
    expect(seedRefusal(RAILWAY, ["--target", "railway", "--reset", "--force"])).toBeNull();
  });

  test("a database that is not on this machine is touched only with a matching --target railway", () => {
    expect(seedRefusal(RAILWAY, [])).toMatch(/not a local database/);
    expect(seedRefusal(OTHER, [])).toMatch(/not a local database/);
    expect(seedRefusal(OTHER, ["--target", "railway"])).toMatch(/not a Railway database/);
    expect(seedRefusal(RAILWAY, ["--target", "railway"])).toBeNull();
    // adding the missing rows to a local database needs no target
    expect(seedRefusal(LOCAL, [])).toBeNull();
    expect(seedRefusal("postgres://u:p@127.0.0.1/db", [])).toBeNull();
  });

  test("an unknown or missing target value is refused, and no message names the address", () => {
    expect(seedRefusal(LOCAL, ["--target"])).toMatch(/Say which database/);
    expect(seedRefusal(LOCAL, ["--target", "prod"])).toMatch(/Say which database/);
    expect(seedRefusal("not a url", ["--reset", "--target", "local"])).toMatch(/not a local database/);
    for (const args of [["--reset"], [], ["--target", "local"], ["--reset", "--target", "railway"]]) {
      const text = seedRefusal(RAILWAY, args) ?? "";
      expect(text).not.toContain("rlwy");
      expect(text).not.toContain("u:p");
    }
  });
});
