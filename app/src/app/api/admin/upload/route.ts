import { withAdmin } from "@/server/auth";
import { logFailure, logNote } from "@/server/log";
import { MAX_IMAGE_BYTES, putImage, UploadError, type UploadReason } from "@/server/media";
import { mediaStore } from "@/server/media-store";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const STATUS: Record<UploadReason, number> = { type: 415, size: 413, empty: 400, content: 415 };
/** Room for the multipart boundaries and headers around the file. */
const ENVELOPE = 64 * 1024;

/**
 * POST /api/admin/upload — one image as multipart field `file` (signed-in admins only; a cross-site POST is 403).
 * 201 `{ ok: true, key }` with the image's key (img/<uuid>.<ext>); 400/413/415 `{ ok: false, error }` with error
 * missing | type | size | empty | content; 503 `{ ok: false, error: "storage" }` when there is no image store (production
 * without the R2 variables); 500 `{ ok: false, error: "server" }` when the store fails.
 */
export const POST = withAdmin(async (request) => {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + ENVELOPE) return json({ ok: false, error: "size" }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "missing" }, 400);
  try {
    const store = mediaStore();
    if (!store) {
      logNote("[admin] image upload refused: no image store (production needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET)");
      return json({ ok: false, error: "storage" }, 503);
    }
    const { key } = await putImage(store, file);
    return json({ ok: true, key }, 201);
  } catch (e) {
    if (e instanceof UploadError) return json({ ok: false, error: e.reason }, STATUS[e.reason]);
    logFailure("[admin] image upload failed", e);
    return json({ ok: false, error: "server" }, 500);
  }
});
