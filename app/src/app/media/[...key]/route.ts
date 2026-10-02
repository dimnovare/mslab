import { logFailure } from "@/server/log";
import { NO_MEDIA, serveMedia } from "@/server/media";
import { mediaStore } from "@/server/media-store";

export const dynamic = "force-dynamic";

/**
 * GET /media/img/<uuid>.<jpg|png|webp> — an uploaded image from the image store (public: the site shows them): R2 through
 * its S3 API, or the local folder under `next dev`. Any other path is 404, and so is every path in production without
 * the R2 variables. Answers with the stored image type, nosniff and `Cache-Control: public, max-age=31536000, immutable`;
 * the noindex header is next.config.ts's.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const { key } = await ctx.params;
  try {
    return await serveMedia(mediaStore() ?? NO_MEDIA, key.join("/"));
  } catch (e) {
    logFailure("[media] read failed", e);
    return new Response("Server error", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
