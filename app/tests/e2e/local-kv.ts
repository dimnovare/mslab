import postgres from "postgres";
import { assertLocalDatabases, isLocalDbUrl } from "./local-db";

// The KV store of the dev server (the kv_entries table of the LOCAL database, server/kv.ts — never a shared one): the
// review comment e2e tests remove the comments they post. The comment API has no delete, so this opens the same
// database the dev server uses.

/** Text every e2e comment starts with, so a run can find the leftovers of an interrupted one. */
export const E2E_COMMENT = "[e2e-kommentaar]";

const DB_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mslab";

async function withLocalKv<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  if (!isLocalDbUrl(DB_URL)) assertLocalDatabases([{ source: "E2E_DATABASE_URL", url: DB_URL }]);
  const sql = postgres(DB_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Deletes these comments (record and id index) from the local KV. */
export function deleteLocalComments(ids: string[]): Promise<void> {
  return withLocalKv(async (sql) => {
    for (const id of ids) {
      await sql`delete from kv_entries where key = (select value from kv_entries where key = ${`id:${id}`})`;
      await sql`delete from kv_entries where key = ${`id:${id}`}`;
    }
  });
}

/**
 * Deletes the rate limit counters (`rl:<form>:<ip>`) of the local KV: every e2e test is its own visitor, so a run leaves
 * dozens of them (10-minute counters that hold visitor addresses) in the local database. Returns how many there were.
 */
export function removeRateLimitRows(): Promise<number> {
  return withLocalKv(async (sql) => (await sql`delete from kv_entries where key like 'rl:%' returning key`).length);
}

/** Deletes every e2e comment still in the local KV; returns how many there were. */
export function removeLeftoverComments(): Promise<number> {
  return withLocalKv(async (sql) => {
    const rows = await sql<{ key: string; value: string }[]>`select key, value from kv_entries where key like 'fb:%'`;
    let n = 0;
    for (const { key, value } of rows) {
      const rec = JSON.parse(value) as { id?: string; text?: string };
      if (!rec.text?.startsWith(E2E_COMMENT)) continue;
      await sql`delete from kv_entries where key = ${key}`;
      if (rec.id) await sql`delete from kv_entries where key = ${`id:${rec.id}`}`;
      n++;
    }
    return n;
  });
}
