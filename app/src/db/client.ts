import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { perRequest } from "../server/per-request";
import * as schema from "./schema";

/** Query functions take a Db as their first parameter. Production passes the Hyperdrive client; tests pass PGlite. */
export type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;
/** An open transaction of the Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** The database or an open transaction: queries that also run inside a caller's transaction take this. */
export type Q = Db | Tx;

/** Seconds to wait for a connection, so a slow or unreachable database cannot hang the page (it fails, then shows the error page). */
const CONNECT_TIMEOUT = 5;

/**
 * `prepare: false`: Hyperdrive caches read queries for 60 s (+15 s stale) and does not invalidate them on writes, so
 * after Maria saves a course the catalogue, the calendar and the editor itself could show the old data for a minute.
 * Hyperdrive does not cache the queries of a postgres.js client without prepared statements (Hyperdrive docs,
 * "Uncached queries"), so every read sees the latest write. The pooling stays. Caching is also turned off on the
 * Hyperdrive configuration itself (`wrangler hyperdrive update <id> --caching-disabled`), so the guarantee does not
 * rest on this option alone.
 */
const client = (url: string) => postgres(url, { max: 5, fetch_types: false, connect_timeout: CONNECT_TIMEOUT, prepare: false });

// `next dev` is one long-lived Node process: a client per request would keep its sockets open until Postgres
// refuses new clients ("too many clients already"), so dev reuses a single pool (kept across hot reloads).
const devGlobal = globalThis as typeof globalThis & { __mslabDevDb?: Db };

/**
 * The client of this Worker request, one per request (server/per-request.ts; not React's cache(), which after a CPU-limit
 * kill handed requests a client that another request had already closed). Hyperdrive pools the real connections.
 *
 * The app does not close it: the Workers runtime closes a request's sockets when the request is over (response sent,
 * waitUntil work done), as in Cloudflare's Hyperdrive + postgres.js examples, which never call end(). An explicit end()
 * makes postgres.js reject every later query (CONNECTION_ENDED), and a request's last query may come after its response
 * (OpenNext storing the rendered page, `after()` work).
 */
const requestClient = perRequest((): Db => drizzle(client(getCloudflareContext().env.HYPERDRIVE.connectionString), { schema }));

/** The database: this Worker request's client (production), or the one pool of `next dev`. */
export function getDb(): Db {
  if (process.env.NODE_ENV === "development") {
    return (devGlobal.__mslabDevDb ??= drizzle(client(getCloudflareContext().env.HYPERDRIVE.connectionString), { schema }));
  }
  return requestClient();
}
