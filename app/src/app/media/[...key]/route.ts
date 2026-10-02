import { getCloudflareContext } from "@opennextjs/cloudflare";
import { logFailure } from "@/server/log";
import { serveMedia } from "@/server/media";

export const dynamic = "force-dynamic";

/**
 * GET /media/img/<uuid>.<jpg|png|webp> — an uploaded image from the R2 bucket (public: the site shows them). Any other
 * path is 404. Answers with the stored image type, nosniff and `Cache-Control: public, max-age=31536000, immutable`.
 *
 * Under `next dev` only, in practice: the deployed Worker answers every GET and HEAD of /media/<key> itself, before
 * OpenNext and Next.js (src/worker/media-front.ts, the same serveMedia()), and leaves only other methods and redirected
 * addresses to this app.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const { key } = await ctx.params;
  try {
    // Task 3: the MEDIA R2 binding becomes the S3 client
    return await serveMedia(getCloudflareContext().env.MEDIA, key.join("/"));
  } catch (e) {
    logFailure("[media] read failed", e);
    return new Response("Server error", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
