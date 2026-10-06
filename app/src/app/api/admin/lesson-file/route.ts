import { getDb } from "@/db/client";
import { withAdmin } from "@/server/auth";
import { addLessonFile } from "@/server/lesson-files";
import { logFailure, logNote } from "@/server/log";
import { MAX_IMAGE_BYTES, UploadError, type UploadReason } from "@/server/media";
import { mediaStore } from "@/server/media-store";

export const dynamic = "force-dynamic";
// R2 is given 10 s to answer (server/r2.ts); whatever else holds a request up ends after 30 s
export const maxDuration = 30;

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const STATUS: Record<UploadReason, number> = { type: 415, size: 413, empty: 400, content: 415 };
/** Room for the multipart boundaries and the lesson id around the file. */
const ENVELOPE = 64 * 1024;

/**
 * POST /api/admin/lesson-file — one file for a lesson (signed-in admins only; a cross-site POST is 403): multipart fields
 * `lessonId` and `file` (PDF, .docx, JPEG, PNG or WebP, at most 4 MB). 201 `{ ok: true, file }` (server/lesson-files.ts
 * StoredLessonFile); 400 missing | empty; 404 notFound; 413 size; 415 type | content; 503 storage (no store); 500 server.
 */
export const POST = withAdmin(async (request) => {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + ENVELOPE) return json({ ok: false, error: "size" }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const lessonId = Number(form?.get("lessonId"));
  if (!(file instanceof File) || !Number.isInteger(lessonId) || lessonId <= 0 || lessonId > 2_147_483_647) return json({ ok: false, error: "missing" }, 400);
  try {
    const store = mediaStore();
    if (!store) {
      logNote("[admin] lesson file refused: no file store (production needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET)");
      return json({ ok: false, error: "storage" }, 503);
    }
    const saved = await addLessonFile(getDb(), store, lessonId, file);
    return saved === "notFound" ? json({ ok: false, error: "notFound" }, 404) : json({ ok: true, file: saved }, 201);
  } catch (e) {
    if (e instanceof UploadError) return json({ ok: false, error: e.reason }, STATUS[e.reason]);
    logFailure("[admin] lesson file upload failed", e);
    return json({ ok: false, error: "server" }, 500);
  }
});
