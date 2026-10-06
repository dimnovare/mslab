import type { LessonKind, VideoStatus } from "@/db/schema";

// The learning rules of phase 3a (spec 3, 4, 5), pure: which lessons a student may open, how a lesson is completed, where the
// course goes on, how a lesson moves in the admin's list, and how a lesson's video is uploaded, replaced and given up. No database,
// no React (tests/unit/lessons.test.ts).

export type LessonState = "done" | "current" | "locked";

/** A visible lesson of a course, in course order (module position, then lesson position), with one student's progress. */
export type OrderedLesson = { id: number; done: boolean; unlockedByAdmin: boolean };

/**
 * The state of each lesson, in the same order. Lesson k is open when it is the first, when the lesson before it is done, or when an
 * admin opened it for this student ("Ava järgmine õppetund"). Done wins; open and not done is "current"; the rest is "locked".
 * Hidden lessons are not in the list, so they neither count nor block.
 */
export function lessonStates(lessons: readonly OrderedLesson[]): LessonState[] {
  return lessons.map((l, i) => {
    if (l.done) return "done";
    return i === 0 || lessons[i - 1].done || l.unlockedByAdmin ? "current" : "locked";
  });
}

export type CourseProgress = { done: number; total: number; next: number | null };

/** "5 / 24 õppetundi tehtud" and where "Jätka" goes: the first open lesson that is not done (null when none is left). */
export function courseProgress(lessons: readonly OrderedLesson[]): CourseProgress {
  const at = lessonStates(lessons).indexOf("current");
  return { done: lessons.filter((l) => l.done).length, total: lessons.length, next: at < 0 ? null : lessons[at].id };
}

/** The visible lesson after `id` in course order ("Järgmine õppetund"), or null (the last one, or not in the list). */
export function nextLessonAfter(lessons: readonly { id: number }[], id: number): number | null {
  const at = lessons.findIndex((l) => l.id === id);
  return at >= 0 && at + 1 < lessons.length ? lessons[at + 1].id : null;
}

/** Has a student watched enough of a video of `durationSec` seconds: at least 90 % of it (spec 5)? A video without a length never. */
export function isWatched(watchedSec: number, durationSec: number | null): boolean {
  return durationSec !== null && durationSec > 0 && watchedSec * 10 >= durationSec * 9;
}

/** Where the player starts: the saved second, unless the lesson is done or barely begun (then the start); never in the last 5 s. */
export function resumeAt(watchedSec: number, durationSec: number, done: boolean): number {
  if (done || watchedSec < 5) return 0;
  return Math.max(0, Math.min(Math.floor(watchedSec), durationSec - 5));
}

/** A video's length as the admin reads it: "12:34", "1:02:03". */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const two = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** The admin's lessons of a course: its modules in order, each with its lessons in order (hidden ones too). */
export type ModuleLayout = { moduleId: number; lessonIds: number[] };

/**
 * ↑ / ↓ on a lesson: it swaps with its neighbour in the module; at the top of a module ↑ moves it to the end of the module before,
 * at the bottom ↓ to the start of the module after (an empty one too). null when it cannot move or is unknown. A new layout.
 */
export function moveLesson(layout: readonly ModuleLayout[], lessonId: number, dir: -1 | 1): ModuleLayout[] | null {
  const m = layout.findIndex((x) => x.lessonIds.includes(lessonId));
  if (m < 0) return null;
  const out = layout.map((x) => ({ moduleId: x.moduleId, lessonIds: [...x.lessonIds] }));
  const list = out[m].lessonIds;
  const i = list.indexOf(lessonId);
  const j = i + dir;
  if (j >= 0 && j < list.length) {
    [list[i], list[j]] = [list[j], list[i]];
    return out;
  }
  const target = m + dir;
  if (target < 0 || target >= out.length) return null;
  list.splice(i, 1);
  if (dir < 0) out[target].lessonIds.push(lessonId);
  else out[target].lessonIds.unshift(lessonId);
  return out;
}

/** The picture size of a video in pixels, as Bunny reports it. */
export type VideoShape = { width: number; height: number };

/** The largest side Bunny can hold (8K is 7680): anything above is not a video's size. */
const MAX_SIDE = 10_000;

/** A usable shape: both sides whole numbers of 1 … 10 000 pixels (Bunny gives 0 for an unknown one), else null. */
export function validShape(shape: { width: number; height: number } | null | undefined): VideoShape | null {
  if (!shape) return null;
  const { width, height } = shape;
  const fine = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_SIDE;
  return fine(width) && fine(height) ? { width, height } : null;
}

/**
 * A lesson's video columns (schema `lessons`). `videoWidth` / `videoHeight` are the picture size of the video that PLAYS (the ready
 * one, or the replaced one while a replacement uploads): both numbers or both null (unknown: the player assumes 16:9).
 */
export type VideoFields = {
  videoId: string | null;
  videoStatus: VideoStatus;
  replacedVideoId: string | null;
  durationSec: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
};
/** The columns after a change, and the Bunny videos nobody plays any more (to delete). */
export type VideoChange = { next: VideoFields; obsolete: string[] };

/** The video students get: the ready one, or during a replacement the old one; null when there is none to play. */
export function playableVideo(v: VideoFields): string | null {
  return v.videoStatus === "ready" && v.videoId ? v.videoId : v.replacedVideoId;
}

/**
 * How a lesson can be completed. The kind is explicit (lessons.kind), never inferred from a missing video:
 * - "mark": a text lesson, done with "Märgi tehtuks";
 * - "watch": a video lesson whose video plays (a ready one, or the replaced one during a replacement), done at 90 % of it;
 * - "wait": a video lesson with nothing to play yet (none, uploading, processing, failed). The student sees "Video lisandub peagi";
 *   nothing completes it, so the lessons after it stay locked.
 */
export type Completion = "mark" | "watch" | "wait";

export function completion(l: VideoFields & { kind: LessonKind }): Completion {
  if (l.kind === "text") return "mark";
  return playableVideo(l) && (l.durationSec ?? 0) > 0 ? "watch" : "wait";
}

/** The admin switches a lesson to "Tekst": every video it has (the current upload, a replaced one) becomes obsolete; its shape goes too. */
export function dropVideo(v: VideoFields): VideoChange {
  return {
    next: { videoId: null, videoStatus: "none", replacedVideoId: null, durationSec: null, videoWidth: null, videoHeight: null },
    obsolete: [v.videoId, v.replacedVideoId].filter((id): id is string => id !== null),
  };
}

/** A new upload of `newVideoId` begins. A ready video becomes the replaced one (it keeps playing); an unfinished or failed one is given up. Unchanged if the videoId is the same. */
export function startUpload(v: VideoFields, newVideoId: string): VideoChange {
  if (v.videoId === newVideoId) return { next: v, obsolete: [] };
  if (v.videoStatus === "ready" && v.videoId) return { next: { ...v, videoId: newVideoId, videoStatus: "uploading", replacedVideoId: v.videoId }, obsolete: [] };
  return { next: { ...v, videoId: newVideoId, videoStatus: "uploading" }, obsolete: v.videoId ? [v.videoId] : [] };
}

/**
 * Bunny's word about `videoId` (the editor's poll, the webhook): null when unchanged (not the current upload, a stale status,
 * a downgrade, or an unusable length). Ready: its length and its shape are stored and the replaced video becomes obsolete. The shape
 * is the one of the video that plays: stored only on the way to ready (both sides whole numbers of 1 … 10 000, else both null: the
 * player then assumes 16:9), so while a replacement uploads or processes the old video's shape stays, and the new one's takes its
 * place when it is ready. Any other status leaves the shape alone. Status moves forward only: uploading < processing <
 * ready/failed. Allows recovery (failed → ready) but not downgrade (ready → failed).
 */
export function settleVideo(
  v: VideoFields,
  videoId: string,
  status: "uploading" | "processing" | "ready" | "failed",
  lengthSec: number,
  shape?: { width: number; height: number } | null,
): VideoChange | null {
  if (v.videoId !== videoId) return null;

  // Status rank: uploading=0, processing=1, ready/failed=2
  const statusRank: Record<VideoStatus, number> = { none: -1, uploading: 0, processing: 1, ready: 2, failed: 2 };
  const newRank = statusRank[status];
  const currentRank = statusRank[v.videoStatus];

  // Only move forward (or stay failed → ready recovery)
  if (newRank < currentRank) return null;
  // Block downgrade from ready to failed
  if (v.videoStatus === "ready" && status === "failed") return null;

  if (status === "ready") {
    const rounded = Math.round(lengthSec);
    if (!Number.isFinite(lengthSec) || rounded < 1) return null;
    const fit = validShape(shape);
    return {
      next: { videoId, videoStatus: "ready", replacedVideoId: null, durationSec: rounded, videoWidth: fit?.width ?? null, videoHeight: fit?.height ?? null },
      obsolete: v.replacedVideoId ? [v.replacedVideoId] : [],
    };
  }
  return { next: { ...v, videoStatus: status }, obsolete: [] };
}

/**
 * An upload left unfinished for a day (the daily sweep): the replaced video comes back (with its shape, which was kept for it), or the
 * lesson has no video again. Never abandons a ready video.
 */
export function abandonUpload(v: VideoFields): VideoChange {
  if (v.videoStatus === "ready") return { next: v, obsolete: [] };
  const obsolete = v.videoId ? [v.videoId] : [];
  if (v.replacedVideoId) return { next: { videoId: v.replacedVideoId, videoStatus: "ready", replacedVideoId: null, durationSec: v.durationSec, videoWidth: v.videoWidth, videoHeight: v.videoHeight }, obsolete };
  return { next: { videoId: null, videoStatus: "none", replacedVideoId: null, durationSec: null, videoWidth: null, videoHeight: null }, obsolete };
}
