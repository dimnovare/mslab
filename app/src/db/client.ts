import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/** Query functions take a Db as their first parameter. Production passes the Hyperdrive client; tests pass PGlite. */
export type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

// Hyperdrive pools connections; create a small client per request.
export function getDb(): Db {
  const { env } = getCloudflareContext();
  const sql = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
  return drizzle(sql, { schema });
}
