import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withAdmin } from "@/server/auth";
import { logFailure } from "@/server/log";
import { MAX_IMAGE_BYTES, putImage, UploadError, type UploadReason } from "@/server/media";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const STATUS: Record<UploadReason, number> = { type: 415, size: 413, empty: 400, content: 415 };
/** Room for the multipart boundaries and headers around the file. */
const ENVELOPE = 64 * 1024;

/**
 * POST /api/admin/upload — one image as multipart field `file` (signed-in admins only; a cross-site POST is 403).
 * 201 `{ ok: true, key }` with the R2 key (img/<uuid>.<ext>); 400/413/415 `{ ok: false, error }` with error
 * missing | type | size | empty | content; 500 `{ ok: false, error: "server" }` when R2 fails.
 */
export const POST = withAdmin(async (request) => {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + ENVELOPE) return json({ ok: false, error: "size" }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "missing" }, 400);
  try {
    // Task 3: the MEDIA R2 binding becomes the S3 client
    const { key } = await putImage(getCloudflareContext().env, file);
    return json({ ok: true, key }, 201);
  } catch (e) {
    if (e instanceof UploadError) return json({ ok: false, error: e.reason }, STATUS[e.reason]);
    logFailure("[admin] image upload failed", e);
    return json({ ok: false, error: "server" }, 500);
  }
});
