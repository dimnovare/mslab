import { getDb } from "@/db/client";
import { bunnyApi, bunnyConfig } from "@/server/bunny";
import { refreshLessonVideo } from "@/server/lesson-videos";
import { logFailure } from "@/server/log";
import { keyMatches } from "@/server/review-key";

export const dynamic = "force-dynamic";
// Bunny is given 10 s to answer (server/bunny.ts)
export const maxDuration = 30;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Bunny's payload is three small fields; anything much bigger is not Bunny. */
const BODY_MAX = 4096;

/**
 * POST /api/bunny/webhook?secret=<BUNNY_WEBHOOK_SECRET> — Bunny Stream's webhook ({ VideoLibraryId, VideoGuid, Status },
 * bunny.net/docs/stream/webhooks). Only a trigger: for a video of our library that a lesson is uploading, the status is read from
 * Bunny's API and stored (lesson-videos.ts refreshLessonVideo). The payload's Status is never used (its numbers even differ from the
 * API's), so spoofing is harmless. The secret is in the query because Bunny sends no header the app could check (spec 8; it shows
 * in request logs, which global-constraints accepts: it only lets someone ask for a status read). Nothing here logs an id.
 * 401 with a wrong secret (when one is set, checked before anything else, in constant time); 404 when Bunny is not set up; 400 for a
 * body that is no JSON object; 500 when the status read fails (Bunny sends the webhook again); else 200, also for videos and
 * libraries that are not ours.
 */
export async function POST(request: Request): Promise<Response> {
  const config = bunnyConfig();
  if (!config) return json(404, { ok: false });
  if (config.webhookSecret && !(await keyMatches(new URL(request.url).searchParams.get("secret"), config.webhookSecret))) return json(401, { ok: false });
  if (Number(request.headers.get("content-length") ?? 0) > BODY_MAX) return json(400, { ok: false });
  let body: unknown = null;
  try {
    const text = await request.text();
    body = text.length <= BODY_MAX ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json(400, { ok: false });
  const { VideoLibraryId, VideoGuid } = body as { VideoLibraryId?: unknown; VideoGuid?: unknown };
  if (typeof VideoGuid !== "string" || !GUID.test(VideoGuid) || String(VideoLibraryId) !== config.libraryId) return json(200, { ok: true });
  try {
    await refreshLessonVideo(getDb(), bunnyApi(config), { videoId: VideoGuid });
    return json(200, { ok: true });
  } catch (e) {
    logFailure("[bunny] webhook status read failed", e);
    return json(500, { ok: false });
  }
}
