import { commentPlace, MAX_PATCH_BYTES, readBody, setDone } from "@/server/feedback";
import { logFailure } from "@/server/log";
import { feedbackContext, reply } from "../shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/feedback/:id — the place and text of one comment, for "?fb=<id>" (404 for an unknown id). */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    return reply(await commentPlace(feedbackContext(request).env.KV, id));
  } catch (e) {
    logFailure("[feedback] read failed", e);
    return reply({ status: 500, body: { ok: false } });
  }
}

/** PATCH /api/feedback/:id `{ done: true|false }` (header x-key: ADMIN_KEY; 401 without it, 404 unknown id, 400 bad body). */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const { env, key } = feedbackContext(request);
    return reply(await setDone(env.KV, id, request.headers.get("x-key"), key, await readBody(request, MAX_PATCH_BYTES)));
  } catch (e) {
    logFailure("[feedback] update failed", e);
    return reply({ status: 500, body: { ok: false } });
  }
}
