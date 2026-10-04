import { getDb } from "@/db/client";
import { sweepClientRows } from "@/server/client-auth";
import { serverEnv } from "@/server/env";
import { sweepExpired } from "@/server/kv";
import { logFailure } from "@/server/log";
import { keyMatches } from "@/server/review-key";

export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * GET /api/cron/sweep — Vercel's daily cron (vercel.json), one invocation that deletes:
 * - the expired kv_entries rows, so the forms' rate limit counters (which hold visitors' addresses) are gone a day after their
 *   window at the latest, also when no submission comes to sweep them (server/kv.ts);
 * - the client accounts' old rows (server/client-auth.ts sweepClientRows): login codes past their 30 minutes (they hold the
 *   address in plain text), sessions over for more than 30 days, and the mail counters of days more than a week ago.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has the CRON_SECRET variable; anything else, and every
 * request while CRON_SECRET is not set, is a 401.
 * 200 `{ ok: true, deleted, logins, sessions, mailDays }` (counts; `deleted` is the kv entries); 500 `{ ok: false }` when the
 * database fails.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || !(await keyMatches(request.headers.get("authorization"), `Bearer ${secret}`))) return json(401, { ok: false });
  try {
    const db = getDb();
    const now = new Date();
    const [deleted, accounts] = await Promise.all([sweepExpired(db, now), sweepClientRows(db, now)]);
    console.info(
      `[cron] sweep: ${deleted} expired kv entries, ${accounts.logins} login codes, ${accounts.sessions} sessions, ${accounts.mailDays} mail counters deleted`,
    );
    return json(200, { ok: true, deleted, ...accounts });
  } catch (e) {
    logFailure("[cron] sweep failed", e);
    return json(500, { ok: false });
  }
}
