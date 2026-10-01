import { cache } from "react";
import { after } from "next/server";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/** Query functions take a Db as their first parameter. Production passes the Hyperdrive client; tests pass PGlite. */
export type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

/** Seconds to wait for a connection, so a slow or unreachable database cannot hang the page (the shell falls back). */
const CONNECT_TIMEOUT = 5;
/** Seconds that in-flight queries get to finish when the per-request client is closed. */
const END_TIMEOUT = 5;

const client = (url: string) => postgres(url, { max: 5, fetch_types: false, connect_timeout: CONNECT_TIMEOUT });

// `next dev` is one long-lived Node process: a client per request would keep its sockets open until Postgres
// refuses new clients ("too many clients already"), so dev reuses a single pool (kept across hot reloads).
const devGlobal = globalThis as typeof globalThis & { __mslabDevDb?: Db };

/**
 * One database client per request (React cache() memoises per render/request); Hyperdrive pools the real connections.
 * In production the client is closed once the response has been sent: next/server `after()` runs the callback through
 * the Worker's `ctx.waitUntil` (OpenNext provides the request context), so the Worker stays alive until `end()` resolves.
 * `end()` cannot be handed to `ctx.waitUntil` directly at creation time: postgres.js rejects every query issued after
 * `end()` has been called, so the request's own queries would fail.
 */
export const getDb = cache((): Db => {
  const { env } = getCloudflareContext();
  if (process.env.NODE_ENV === "development") {
    return (devGlobal.__mslabDevDb ??= drizzle(client(env.HYPERDRIVE.connectionString), { schema }));
  }
  const sql = client(env.HYPERDRIVE.connectionString);
  after(() => sql.end({ timeout: END_TIMEOUT }));
  return drizzle(sql, { schema });
});
