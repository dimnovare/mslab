import { cache } from "react";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/** Query functions take a Db as their first parameter. Production passes the Hyperdrive client; tests pass PGlite. */
export type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

const connect = (url: string): Db => drizzle(postgres(url, { max: 5, fetch_types: false }), { schema });

// `next dev` is one long-lived Node process: a client per request would keep its sockets open until Postgres
// refuses new clients ("too many clients already"), so dev reuses a single pool (kept across hot reloads).
const devGlobal = globalThis as typeof globalThis & { __mslabDevDb?: Db };

// Hyperdrive pools connections; create a small client once per request (React cache() memoises per render/request).
export const getDb = cache((): Db => {
  const { env } = getCloudflareContext();
  if (process.env.NODE_ENV === "development") return (devGlobal.__mslabDevDb ??= connect(env.HYPERDRIVE.connectionString));
  return connect(env.HYPERDRIVE.connectionString);
});
