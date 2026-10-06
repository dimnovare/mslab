import { getDb, type Db } from "@/db/client";
import { bunnyApi, bunnyConfig, type BunnyConfig } from "@/server/bunny";
import { sweepClientRows } from "@/server/client-auth";
import { serverEnv } from "@/server/env";
import { sweepExpired } from "@/server/kv";
import { sweepStuckProcessing, sweepStuckUploads } from "@/server/lesson-videos";
import { logFailure } from "@/server/log";
import { keyMatches } from "@/server/review-key";

export const dynamic = "force-dynamic";
// The Bunny part is bounded (SWEEP_BATCH rows of each kind, each one or two calls of at most 10 s); Hobby's functions run up to 60 s.
export const maxDuration = 60;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The Bunny part of the sweep: uploads first, then processing (one after the other, so the Bunny calls stay few at a time). None without Bunny's settings. */
async function sweepVideos(db: Db, bunny: BunnyConfig | null, now: Date) {
  if (!bunny) return { uploads: 0, processingReady: 0, processingFailed: 0 };
  const api = bunnyApi(bunny);
  const uploads = await sweepStuckUploads(db, api, now);
  const processing = await sweepStuckProcessing(db, api, now);
  return { uploads, processingReady: processing.ready, processingFailed: processing.failed };
}

/**
 * GET /api/cron/sweep — Vercel's daily cron (vercel.json), one invocation that deletes:
 * - the expired kv_entries rows, so the forms' rate limit counters (which hold visitors' addresses) are gone a day after their
 *   window at the latest, also when no submission comes to sweep them (server/kv.ts);
 * - the client accounts' old rows (server/client-auth.ts sweepClientRows): login codes past their 30 minutes (they hold the
 *   address in plain text), sessions over for more than 30 days, and the mail counters of days more than a week ago;
 * - with Bunny set up (server/lesson-videos.ts), the lesson videos left unfinished for a day, at most SWEEP_BATCH of each kind a run:
 *   uploads still "uploading" a day after they began are deleted from Bunny (`uploads`), and the lesson gets back its replaced
 *   video or has none; videos still "processing" a day after are asked about and settled, ready (`processingReady`) or failed
 *   (`processingFailed`, so the editor offers "Lae uuesti üles"). A ready video is never destroyed, and a replaced video that
 *   still plays is only deleted once the new one is ready.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has the CRON_SECRET variable; anything else, and every
 * request while CRON_SECRET is not set, is a 401.
 * 200 `{ ok: true, deleted, logins, sessions, mailDays, uploads, processingReady, processingFailed }` (counts; `deleted` is the kv
 * entries); 500 `{ ok: false }` when the database fails. The log line has the counts only, no ids.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || !(await keyMatches(request.headers.get("authorization"), `Bearer ${secret}`))) return json(401, { ok: false });
  try {
    const db = getDb();
    const now = new Date();
    const [deleted, accounts, videos] = await Promise.all([sweepExpired(db, now), sweepClientRows(db, now), sweepVideos(db, bunnyConfig(), now)]);
    console.info(
      `[cron] sweep: ${deleted} expired kv entries, ${accounts.logins} login codes, ${accounts.sessions} sessions, ${accounts.mailDays} mail counters, ${videos.uploads} stuck video uploads deleted, ${videos.processingReady} stuck processing videos found ready, ${videos.processingFailed} marked failed`,
    );
    return json(200, { ok: true, deleted, ...accounts, ...videos });
  } catch (e) {
    logFailure("[cron] sweep failed", e);
    return json(500, { ok: false });
  }
}
