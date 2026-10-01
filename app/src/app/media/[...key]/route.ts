import { getCloudflareContext } from "@opennextjs/cloudflare";
import { logFailure } from "@/server/log";
import { serveMedia } from "@/server/media";

export const dynamic = "force-dynamic";

/**
 * GET /media/img/<uuid>.<jpg|png|webp> — an uploaded image from the R2 bucket (public: the site shows them). Any other
 * path is 404. Answers with the stored image type, nosniff and `Cache-Control: public, max-age=31536000, immutable`.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const { key } = await ctx.params;
  try {
    return await serveMedia(getCloudflareContext().env.MEDIA, key.join("/"));
  } catch (e) {
    logFailure("[media] read failed", e);
    return new Response("Server error", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
