import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import { serverEnv } from "../server/env";
import * as schema from "./schema";

/** Query functions take a Db as their first parameter. The server passes the pool of getDb(); tests pass PGlite. */
export type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;
/** An open transaction of the Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** The database or an open transaction: queries that also run inside a caller's transaction take this. */
export type Q = Db | Tx;

/**
 * The pool's settings, in postgres.js seconds.
 * - max 5: one function instance serves a few requests at a time, and Postgres allows 100 connections by default, shared
 *   by every instance Vercel has running.
 * - connect_timeout 5: a slow or unreachable database fails (and shows the error page) instead of hanging the page.
 * - idle_timeout 20: an idle connection is closed after 20 s, so a quiet site holds no Postgres connection slots, and an
 *   instance that was paused between requests is unlikely to reuse a socket the proxy has long dropped.
 * - fetch_types false: the schema has no array or custom column types (jsonb is built in), so the lookup postgres.js
 *   makes on each new connection would only cost a round trip.
 * No `prepare` setting: Drizzle's postgres-js session sends every query through `unsafe()`, which postgres.js never
 * prepares, so the pool would work behind a transaction-mode pooler such as PgBouncer too. (The database is reached
 * directly today: Railway's TCP proxy.)
 */
const POOL = { max: 5, connect_timeout: 5, idle_timeout: 20, fetch_types: false } as const;

// The pool lives on globalThis, not in a module variable: `next dev` evaluates the module again on every hot reload (a
// pool each time would keep its sockets open until Postgres refuses new clients, "too many clients already"), and the
// production build may bundle the module into more than one server chunk.
const shared = globalThis as typeof globalThis & { __mslabDb?: Db };

/**
 * The database: one postgres.js pool for the whole process, made from DATABASE_URL on first use (so a build that never
 * queries needs no database). Without DATABASE_URL, production throws an error that names the variable; `next dev` and
 * the tests use the local database (server/env.ts).
 *
 * Nothing closes the pool and nothing is tied to a request: a request's last query may come after its response (the
 * rendered page being stored, `after()` work), and an end() would make postgres.js reject every later query
 * (CONNECTION_ENDED). The process ending closes the sockets.
 */
export function getDb(): Db {
  return (shared.__mslabDb ??= drizzle(postgres(serverEnv().DATABASE_URL, POOL), { schema }));
}
