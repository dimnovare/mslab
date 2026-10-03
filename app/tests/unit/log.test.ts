import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { errorSummary } from "@/server/log";

test("errorSummary keeps the class, SQLSTATE and HTTP status, never the message or the query parameters", () => {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "subscribers_email"'), { code: "23505" });
  const e = new DrizzleQueryError("insert into subscribers (email, token) values ($1, $2)", ["mari@example.com", "tok3n"], cause);
  expect(errorSummary(e)).toBe("DrizzleQueryError (code 23505)");
  expect(errorSummary(new TypeError("fetch failed: https://api.telegram.org/bot1:secret/x"))).toBe("TypeError");
  expect(errorSummary({ name: "validation_error", message: "to: mari@example.com", statusCode: 422 })).toBe("validation_error (status 422)");
  expect(errorSummary({ name: "has spaces and mari@example.com" })).toBe("object");
  expect(errorSummary("mari@example.com")).toBe("string");
  expect(errorSummary(Object.assign(new Error("x"), { code: "mari@example.com is bad" }))).toBe("Error");
});

test("errorSummary names an error by its own name first: a minified class name (\"_\" in a production build) does not hide it", () => {
  // what the minifier does to `class R2Error extends Error`: the constructor is called "_", the instance keeps the name it sets
  const _ = class extends Error {
    constructor(readonly status: number) {
      super("R2 get answered 403 for https://acct.r2.cloudflarestorage.com/bucket/img/key.jpg");
      this.name = "R2Error";
    }
  };
  Object.defineProperty(_, "name", { value: "_" });
  expect(new _(403).constructor.name).toBe("_");
  expect(errorSummary(new _(403))).toBe("R2Error (status 403)");
  // a name that is empty, plain "Error" or not a short code gives way to the class name
  class Boom extends Error {}
  expect(errorSummary(Object.assign(new Boom("x"), { name: "" }))).toBe("Boom");
  expect(errorSummary(new Boom("x"))).toBe("Boom"); // name stays "Error": the class name is the best there is
  expect(errorSummary(Object.assign(new Boom("x"), { name: "mari@example.com failed" }))).toBe("Boom");
  expect(errorSummary(Object.assign(new Error("x"), { name: "mari@example.com failed" }))).toBe("Error");
  // and a built-in error is still named by its name
  expect(errorSummary(new RangeError("x"))).toBe("RangeError");
});

test("pages, layouts, routes and components log failures through logFailure only, never with console.error (final review M5)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.tsx?$/.test(e.name)) files.push(join(dir, e.name));
    }
  };
  walk("src/app");
  walk("src/components");
  const offenders = files.filter((f) => /console\.(error|warn)\(/.test(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
  expect(readFileSync("src/app/[locale]/(site)/layout.tsx", "utf8")).toContain('logFailure("site shell: settings unavailable", err)');
});
