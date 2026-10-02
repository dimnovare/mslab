import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// A D1 database for unit tests: SQLite in memory (node:sqlite), with the `revalidations` table OpenNext creates for its
// D1 tag cache, read from the installed @opennextjs/cloudflare (cli/commands/populate-cache.js), so the tests use the
// real schema. Only what the app and OpenNext's d1-next-tag-cache call: prepare().bind().raw() / run() / all(), batch().

/** OpenNext's CREATE TABLE for the tag cache, as its `populate-cache` command runs it on deploy. */
export function openNextTagCacheDdl(): string {
  // not in the package's exports: read from node_modules directly
  const file = join(process.cwd(), "node_modules/@opennextjs/cloudflare/dist/cli/commands/populate-cache.js");
  const m = /CREATE TABLE IF NOT EXISTS revalidations \([^;]*\);/.exec(readFileSync(file, "utf8"));
  if (!m) throw new Error("the revalidations table definition was not found in @opennextjs/cloudflare");
  return m[0];
}

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly values: SQLInputValue[] = [],
  ) {}
  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, values as SQLInputValue[]);
  }
  async raw<T = unknown[]>(): Promise<T[]> {
    return this.db.prepare(this.sql).all(...this.values).map((row) => Object.values(row) as T);
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true }> {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[], success: true };
  }
  async run(): Promise<{ success: true }> {
    this.db.prepare(this.sql).run(...this.values);
    return { success: true };
  }
}

/** A fresh in-memory D1 with OpenNext's tag cache table. `rows()` reads the table back. */
export function sqliteD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(openNextTagCacheDdl());
  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        for (const s of statements) await s.run();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return statements.map(() => ({ success: true }));
    },
    exec: (sql: string) => db.exec(sql),
    rows: () => db.prepare("SELECT tag, revalidatedAt, stale, expire FROM revalidations ORDER BY tag").all() as { tag: string; revalidatedAt: number; stale: number | null; expire: number | null }[],
  };
  return { d1, binding: d1 as unknown as D1Database };
}
