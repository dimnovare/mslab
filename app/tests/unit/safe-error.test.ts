import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { DrizzleQueryError } from "drizzle-orm";
import { dbErrorCode, safeDbError } from "@/db/safe-error";

// The CLI tools print a failed database call as a fixed text and the driver's error code, never the error's message:
// Drizzle's wrapper puts the statement and all its bound parameters (the clients' comments, the sample names) in it.

const SECRET = "private-client-comment-text";

const wrapped = (code: unknown) => new DrizzleQueryError(`insert into "kv_entries" values ($1, $2)`, ["fb:secret-key", SECRET], Object.assign(new Error(`duplicate ${SECRET}`), { code }));

describe("safeDbError", () => {
  test("a Drizzle query error: the SQLSTATE of its cause, and nothing of its message", () => {
    const err = wrapped("23505");
    expect(err.message).toContain(SECRET); // the premise: what Drizzle's own message holds
    expect(safeDbError(err)).toBe("database error [23505]");
  });

  test("a driver error without the wrapper, and a network error code", () => {
    expect(safeDbError(Object.assign(new Error(`oops ${SECRET}`), { code: "ECONNREFUSED" }))).toBe("database error [ECONNREFUSED]");
    expect(safeDbError(Object.assign(new Error("x"), { code: "CONNECT_TIMEOUT" }))).toBe("database error [CONNECT_TIMEOUT]");
  });

  test("no code, or a code that is free text, says no code and never the message", () => {
    for (const err of [new Error(SECRET), wrapped(undefined), wrapped(`has ${SECRET} in it`), wrapped(42), SECRET, null, undefined, { message: SECRET }, new DrizzleQueryError("q", [SECRET])]) {
      const text = safeDbError(err);
      expect(text).toBe("database error");
      expect(text).not.toContain(SECRET);
    }
  });

  test("the code is found down the cause chain, at a bounded depth", () => {
    const inner = Object.assign(new Error("inner"), { code: "40001" });
    const mid = new Error("mid", { cause: inner });
    expect(dbErrorCode(new Error("outer", { cause: mid }))).toBe("40001");
    let deep: Error = Object.assign(new Error("deep"), { code: "40001" });
    for (let i = 0; i < 10; i++) deep = new Error("wrap", { cause: deep });
    expect(dbErrorCode(deep)).toBeNull();
  });
});

describe("the CLI tools use it", () => {
  test.each(["fill-ru", "demo", "seed", "copy-kv"])("src/db/%s.ts prints a failed call through safeDbError and no error message", (file) => {
    const source = readFileSync(`src/db/${file}.ts`, "utf8");
    expect(source).toContain("safeDbError(");
    expect(source).not.toMatch(/safeMessage/);
    expect(source).not.toMatch(/err(?:or)?\.message|String\(err\)/);
  });
});
