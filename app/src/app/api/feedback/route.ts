import { createComment, listComments, MAX_BYTES, readBody } from "@/server/feedback";
import { logFailure } from "@/server/log";
import { clientIp } from "@/server/ratelimit";
import { feedbackContext, reply } from "./shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/feedback — a review comment from public/feedback.js (JSON, at most 20 000 bytes). 200 `{ ok: true, id,
 * stored, telegram }`; 400 for a body that is not a JSON object or has no text; 413 too long; 429 after 30 comments in
 * 10 minutes from one visitor; 502 when neither storing nor the Telegram ping worked. See src/server/feedback.ts.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { env, origin } = feedbackContext(request);
    // Without x-forwarded-for (never on Vercel) `next dev` uses one local bucket.
    const ip = clientIp(request.headers) ?? (process.env.NODE_ENV === "development" ? "local" : null);
    return reply(await createComment({ env, origin, ip, now: new Date() }, await readBody(request, MAX_BYTES)));
  } catch (e) {
    logFailure("[feedback] create failed", e);
    return reply({ status: 500, body: { ok: false } });
  }
}

/** GET /api/feedback — every comment with its link (header x-key: ADMIN_KEY; 401 without it). */
export async function GET(request: Request): Promise<Response> {
  try {
    const { env, origin, key } = feedbackContext(request);
    return reply(await listComments(env.KV, origin, request.headers.get("x-key"), key));
  } catch (e) {
    logFailure("[feedback] list failed", e);
    return reply({ status: 500, body: { ok: false } });
  }
}
