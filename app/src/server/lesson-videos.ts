import { and, asc, eq, isNull, lt, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { courseModules, courses, lessons, type VideoStatus } from "@/db/schema";
import { abandonUpload, settleVideo, startUpload, type VideoFields } from "@/domain/lessons";
import { pick } from "@/i18n/field";
import { lessonVideoStatus, tusSignature, UPLOAD_TTL_SEC, type BunnyApi, type BunnyConfig, type BunnyVideo } from "./bunny";
import { deleteBunnyVideos } from "./lesson-media";
import { logFailure } from "./log";

// A lesson's Bunny video (spec 3a sections 4 and 7): the start of an upload (createLessonVideo), the status read (the editor's poll
// every 5 s and Bunny's webhook, which is only a trigger), and the daily sweep of uploads left unfinished. What changes is decided
// by domain/lessons.ts startUpload / settleVideo / abandonUpload; here are the database rows and the Bunny calls.
//
// The poll and the webhook can ask about the same video at the same moment, and Bunny takes up to 10 s to answer. So a status is
// written only by compare-and-set: the UPDATE names the video columns as they were read before Bunny was asked, and changes nothing
// if another write came first (a newer status, a new upload, the switch to Tekst). Only the write that wins deletes a replaced
// video. An answer that changes nothing (a repeated webhook, the next poll) writes nothing.

export type UploadTicket = { videoId: string; libraryId: string; expires: number; signature: string; endpoint: string; title: string };
export type AdminVideo = { status: VideoStatus; durationSec: number | null; replacing: boolean };
export type VideoTicketResult = { ok: true; ticket: UploadTicket } | { ok: false; error: "setup" | "notFound" | "server" };
export type VideoCheckResult = { ok: true; video: AdminVideo } | { ok: false; error: "setup" | "notFound" | "server" };

/** An upload this old is given up by the daily sweep (spec 7). */
const STUCK_MS = 24 * 3600_000;

const VIDEO_COLUMNS = {
  videoId: lessons.videoId,
  videoStatus: lessons.videoStatus,
  replacedVideoId: lessons.replacedVideoId,
  durationSec: lessons.durationSec,
  videoWidth: lessons.videoWidth,
  videoHeight: lessons.videoHeight,
};
const adminVideo = (v: VideoFields): AdminVideo => ({ status: v.videoStatus, durationSec: v.durationSec, replacing: v.replacedVideoId !== null });
const sameVideo = (a: VideoFields, b: VideoFields) =>
  a.videoId === b.videoId &&
  a.videoStatus === b.videoStatus &&
  a.replacedVideoId === b.replacedVideoId &&
  a.durationSec === b.durationSec &&
  a.videoWidth === b.videoWidth &&
  a.videoHeight === b.videoHeight;
const nullable = (column: typeof lessons.videoId | typeof lessons.replacedVideoId, value: string | null): SQL => (value === null ? isNull(column) : eq(column, value));
/** The row still has the video columns it was read with (the compare of compare-and-set). */
const unchangedSince = (id: number, v: VideoFields): SQL =>
  and(eq(lessons.id, id), nullable(lessons.videoId, v.videoId), eq(lessons.videoStatus, v.videoStatus), nullable(lessons.replacedVideoId, v.replacedVideoId))!;

/**
 * A new Bunny video for the lesson (titled "<course> · <lesson>") and the signed tus upload of it, valid for 6 hours; the API key
 * stays here. The lesson becomes "uploading"; a ready video keeps playing as the replaced one; an unfinished or failed earlier
 * upload is deleted from Bunny. "notFound" for an unknown lesson or a text lesson (no Bunny video is made).
 */
export async function startLessonVideo(db: Db, api: BunnyApi, config: BunnyConfig, lessonId: number, now: Date): Promise<UploadTicket | "notFound"> {
  const [lesson] = await db
    .select({ title: lessons.title, kind: lessons.kind, course: courses.title })
    .from(lessons)
    .innerJoin(courseModules, eq(lessons.moduleId, courseModules.id))
    .innerJoin(courses, eq(courseModules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson || lesson.kind !== "video") return "notFound"; // a text lesson has no video field
  const title = `${pick(lesson.course, "et")} · ${pick(lesson.title, "et")}`.slice(0, 200);
  const videoId = await api.createVideo(title);
  let obsolete: string[] | null;
  try {
    // the row is locked from the read to the write: two starts at once (a second tab) each give up the other's upload, in turn
    obsolete = await db.transaction(async (tx) => {
      const [current] = await tx.select(VIDEO_COLUMNS).from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.kind, "video"))).for("update");
      if (!current) return null;
      const change = startUpload(current, videoId);
      const written = await tx.update(lessons).set({ ...change.next, videoStartedAt: now }).where(unchangedSince(lessonId, current)).returning();
      return written.length ? change.obsolete : null;
    });
  } catch (e) {
    await deleteBunnyVideos(api, [videoId]); // not stored: the new video would be nobody's
    throw e;
  }
  if (obsolete === null) {
    await deleteBunnyVideos(api, [videoId]); // the lesson was deleted (or became a text lesson) meanwhile
    return "notFound";
  }
  await deleteBunnyVideos(api, obsolete);
  const expires = Math.floor(now.getTime() / 1000) + UPLOAD_TTL_SEC;
  return { videoId, libraryId: config.libraryId, expires, signature: await tusSignature(config.libraryId, config.apiKey, expires, videoId), endpoint: config.tusEndpoint, title };
}

type VideoRow = VideoFields & { id: number };

/**
 * Stores Bunny's answer about the row's current upload (null: Bunny does not know the video, which counts as failed), by
 * compare-and-set against `row` as it was read before Bunny was asked. Ready or failed ends the upload (its start time is cleared); ready
 * also stores the video's picture size (the two columns are in the same write, so a stale write cannot change them either).
 * The lesson's video as it is now: the new state, the row unchanged, or (another write came first) the row read again.
 */
async function storeAnswer(db: Db, api: BunnyApi, row: VideoRow, videoId: string, bunny: BunnyVideo | null): Promise<AdminVideo | null> {
  const status = bunny ? lessonVideoStatus(bunny.status) : "failed";
  const settled = settleVideo(row, videoId, status, bunny?.length ?? 0, bunny && { width: bunny.width, height: bunny.height });
  if (!settled || sameVideo(settled.next, row)) return adminVideo(row); // nothing new (a stale or repeated answer): no write
  const done = settled.next.videoStatus === "ready" || settled.next.videoStatus === "failed";
  const written = await db
    .update(lessons)
    .set({ ...settled.next, ...(done ? { videoStartedAt: null } : {}) })
    .where(unchangedSince(row.id, row))
    .returning();
  if (!written.length) {
    // another write came first (the webhook and the poll at once, a new upload, Tekst): it stands, and it did the deleting
    const [now] = await db.select(VIDEO_COLUMNS).from(lessons).where(eq(lessons.id, row.id)).limit(1);
    return now ? adminVideo(now) : null;
  }
  await deleteBunnyVideos(api, settled.obsolete);
  return adminVideo(settled.next);
}

/**
 * Reads the status of a lesson's current upload from Bunny's API and stores it. The lesson is named by its id (the editor's poll)
 * or by the video's id (the webhook; any other video is ignored). Only an upload in progress (uploading, processing) is asked
 * about. Ready stores the length and deletes a replaced video; a video Bunny no longer knows counts as failed. null: no such lesson.
 * A Bunny failure (BunnyError, a TimeoutError) is thrown to the caller; the row stays as it was.
 */
export async function refreshLessonVideo(db: Db, api: BunnyApi, target: { lessonId: number } | { videoId: string }): Promise<AdminVideo | null> {
  const where = "lessonId" in target ? eq(lessons.id, target.lessonId) : eq(lessons.videoId, target.videoId);
  const [row] = await db.select({ id: lessons.id, ...VIDEO_COLUMNS }).from(lessons).where(where).limit(1);
  if (!row) return null;
  if (!row.videoId || (row.videoStatus !== "uploading" && row.videoStatus !== "processing")) return adminVideo(row);
  return storeAnswer(db, api, row, row.videoId, await api.getVideo(row.videoId));
}

/**
 * The daily cron's part (spec 7): uploads still "uploading" more than 24 h after they began. Bunny is asked first: an upload that
 * did arrive (nobody asked since: the editor was closed at once and no webhook came) is settled like any status read. One that never
 * arrived is deleted from Bunny, and the lesson gets its replaced video back, or has none again. A Bunny failure leaves the row for
 * the next day. Answers the number of lessons reset.
 */
export async function sweepStuckUploads(db: Db, api: BunnyApi, now: Date): Promise<number> {
  const stuck = await db
    .select({ id: lessons.id, ...VIDEO_COLUMNS })
    .from(lessons)
    .where(and(eq(lessons.videoStatus, "uploading"), lt(lessons.videoStartedAt, new Date(now.getTime() - STUCK_MS))))
    .orderBy(asc(lessons.id));
  let swept = 0;
  for (const row of stuck) {
    try {
      const bunny = row.videoId ? await api.getVideo(row.videoId) : null;
      if (row.videoId && bunny && lessonVideoStatus(bunny.status) !== "uploading") {
        await storeAnswer(db, api, row, row.videoId, bunny);
        continue;
      }
      const { next, obsolete } = abandonUpload(row);
      for (const id of obsolete) await api.deleteVideo(id);
      const reset = await db
        .update(lessons)
        .set({ ...next, videoStartedAt: null })
        .where(unchangedSince(row.id, row)) // still this upload, still "uploading"
        .returning();
      swept += reset.length;
    } catch (e) {
      logFailure("[video] stuck upload not swept", e);
    }
  }
  return swept;
}
