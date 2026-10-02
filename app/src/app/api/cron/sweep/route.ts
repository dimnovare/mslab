import { getDb } from "@/db/client";
import { serverEnv } from "@/server/env";
import { sweepExpired } from "@/server/kv";
import { logFailure } from "@/server/log";
import { keyMatches } from "@/server/review-key";

export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * GET /api/cron/sweep — Vercel's daily cron (vercel.json): deletes the expired kv_entries rows, so the forms' rate limit
 * counters (which hold visitors' addresses) are gone a day after their window at the latest, also when no submission
 * comes to sweep them (server/kv.ts). Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has the
 * CRON_SECRET variable; anything else, and every request while CRON_SECRET is not set, is a 401.
 * 200 `{ ok: true, deleted }`; 500 `{ ok: false }` when the database fails.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || !(await keyMatches(request.headers.get("authorization"), `Bearer ${secret}`))) return json(401, { ok: false });
  try {
    const deleted = await sweepExpired(getDb());
    console.info(`[cron] sweep: ${deleted} expired kv entries deleted`);
    return json(200, { ok: true, deleted });
  } catch (e) {
    logFailure("[cron] sweep failed", e);
    return json(500, { ok: false });
  }
}
