import postgres from "postgres";
import { revalidationTargets, targetTag } from "../server/cache-targets";
import { tagRows, writeTagRows } from "../server/tag-cache";

// The Worker's cron (wrangler.jsonc triggers): a cached page lists the sessions that had not begun when it was
// rendered, and a session is listed and bookable only until it begins. So every few minutes: if a session began since
// the last runs, the pages that list sessions are marked stale (as an admin's session save would), and the next visit
// renders them without it. Runs that find nothing cost one small query and no page renders.
//
// The rows are written in OpenNext's D1 tag cache format (server/tag-cache.ts), because the cron runs outside Next.js.

/** How far back a run looks: two cron periods (every 5 minutes), so a failed run is made up by the next one. */
export const SESSION_WINDOW_MS = 10 * 60_000;

/** The tags of the pages that list sessions. */
export const sessionTags = (): string[] => revalidationTargets({ kind: "sessions" }).map(targetTag);

/** The D1 rows that mark the session pages stale at `now`. */
export const sessionPagesRows = (buildId: string, now: number) => tagRows(buildId, sessionTags(), now);

/** Did a session of a published contact course (one the public pages list) begin in (from, to]? */
async function sessionBegan(connectionString: string, from: Date, to: Date): Promise<boolean> {
  const sql = postgres(connectionString, { max: 1, prepare: false, fetch_types: false, connect_timeout: 5 });
  try {
    const rows = await sql`
      select 1 from course_sessions s join courses c on c.id = s.course_id
      where c.published and c.type = 'contact' and s.starts_at > ${from} and s.starts_at <= ${to}
      limit 1`;
    return rows.length > 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type CronEnv = { HYPERDRIVE?: Hyperdrive; NEXT_TAG_CACHE_D1?: D1Database };

/** One cron run at `scheduledTime`. Returns what it did (logged). */
export async function onSchedule(env: CronEnv, scheduledTime: number, buildId: string | undefined): Promise<string> {
  if (!env.HYPERDRIVE || !env.NEXT_TAG_CACHE_D1 || !buildId) return "skipped: bindings or build id missing";
  const to = new Date(scheduledTime);
  const from = new Date(scheduledTime - SESSION_WINDOW_MS);
  if (!(await sessionBegan(env.HYPERDRIVE.connectionString, from, to))) return "no session began";
  await writeTagRows(env.NEXT_TAG_CACHE_D1, buildId, sessionTags(), Date.now());
  return "a session began: session pages revalidated";
}
