import { describe, expect, test } from "vitest";
import {
  abandonUpload, completion, courseProgress, dropVideo, formatDuration, isWatched, lessonStates, moveLesson, nextLessonAfter, playableVideo, resumeAt,
  settleVideo, startUpload, validShape, videoAspect, type OrderedLesson, type VideoFields,
} from "@/domain/lessons";

// Phase 3a (spec 3 and 5): visible lessons in course order; lesson k opens when it is the first, the one before it is done, or
// an admin opened it. Hidden lessons are not in the list at all.

const L = (id: number, done = false, unlockedByAdmin = false): OrderedLesson => ({ id, done, unlockedByAdmin });

describe("lessonStates", () => {
  test("the first is open; the next opens when the one before is done", () => {
    expect(lessonStates([L(1), L(2), L(3)])).toEqual(["current", "locked", "locked"]);
    expect(lessonStates([L(1, true), L(2), L(3)])).toEqual(["done", "current", "locked"]);
    expect(lessonStates([L(1, true), L(2, true), L(3, true)])).toEqual(["done", "done", "done"]);
  });
  test("an admin's unlock opens that lesson only, not the ones after it", () => {
    expect(lessonStates([L(1), L(2), L(3, false, true), L(4)])).toEqual(["current", "locked", "current", "locked"]);
  });
  test("a done lesson stays done whatever is before it (e.g. a lesson shown again after hiding)", () => {
    expect(lessonStates([L(1), L(2, true), L(3)])).toEqual(["current", "done", "current"]);
  });
  test("no lessons, no states", () => expect(lessonStates([])).toEqual([]));
});

describe("courseProgress", () => {
  test("done of total, and Jätka goes to the first open lesson not done", () => {
    expect(courseProgress([L(1, true), L(2), L(3)])).toEqual({ done: 1, total: 3, next: 2 });
    expect(courseProgress([L(1), L(2)])).toEqual({ done: 0, total: 2, next: 1 });
    expect(courseProgress([L(1, true), L(2, true)])).toEqual({ done: 2, total: 2, next: null });
    expect(courseProgress([])).toEqual({ done: 0, total: 0, next: null });
  });
});

test("nextLessonAfter: the next visible lesson in course order, null after the last or for an unknown id", () => {
  const list = [{ id: 4 }, { id: 9 }, { id: 2 }];
  expect(nextLessonAfter(list, 4)).toBe(9);
  expect(nextLessonAfter(list, 9)).toBe(2);
  expect(nextLessonAfter(list, 2)).toBeNull();
  expect(nextLessonAfter(list, 7)).toBeNull();
});

describe("the 90 % rule and the resume point", () => {
  test("watched at 90 % of the length (integer arithmetic), never for a video without a length", () => {
    expect(isWatched(89, 100)).toBe(false);
    expect(isWatched(90, 100)).toBe(true);
    expect(isWatched(677, 754)).toBe(false); // 89.8 %
    expect(isWatched(679, 754)).toBe(true); // 90.05 %
    expect(isWatched(500, null)).toBe(false);
    expect(isWatched(0, 0)).toBe(false);
    expect(isWatched(100, 100)).toBe(true);
    expect(isWatched(150, 100)).toBe(true); // watched > duration is still watched
  });
  test("resume at the saved second, but from the start when done or barely begun, and never in the last 5 s", () => {
    expect(resumeAt(42.7, 100, false)).toBe(42);
    expect(resumeAt(4, 100, false)).toBe(0);
    expect(resumeAt(99, 100, false)).toBe(95);
    expect(resumeAt(80, 100, true)).toBe(0);
    expect(resumeAt(5, 100, false)).toBe(5);
    expect(resumeAt(6, 10, false)).toBe(5); // video shorter than 10s, start at 5
  });
  test("durations as the admin and the student read them", () => {
    expect(formatDuration(754)).toBe("12:34");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-3)).toBe("0:00");
    expect(formatDuration(59.5)).toBe("1:00");
    expect(formatDuration(3600)).toBe("1:00:00");
  });
});

describe("moveLesson (↑ ↓ within and across modules)", () => {
  const layout = [{ moduleId: 10, lessonIds: [1, 2] }, { moduleId: 20, lessonIds: [] }, { moduleId: 30, lessonIds: [3] }];
  test("swaps with its neighbour inside the module", () => {
    expect(moveLesson(layout, 2, -1)).toEqual([{ moduleId: 10, lessonIds: [2, 1] }, { moduleId: 20, lessonIds: [] }, { moduleId: 30, lessonIds: [3] }]);
  });
  test("in-module ↓ swap", () => {
    expect(moveLesson([{ moduleId: 10, lessonIds: [1, 2, 3] }], 1, 1)).toEqual([{ moduleId: 10, lessonIds: [2, 1, 3] }]);
  });
  test("past the end of its module: to the start of the next one (empty or not), or the end of the one before", () => {
    expect(moveLesson(layout, 2, 1)).toEqual([{ moduleId: 10, lessonIds: [1] }, { moduleId: 20, lessonIds: [2] }, { moduleId: 30, lessonIds: [3] }]);
    expect(moveLesson(layout, 3, -1)).toEqual([{ moduleId: 10, lessonIds: [1, 2] }, { moduleId: 20, lessonIds: [3] }, { moduleId: 30, lessonIds: [] }]);
  });
  test("with non-empty target modules", () => {
    const denseLayout = [{ moduleId: 10, lessonIds: [1, 2] }, { moduleId: 20, lessonIds: [7, 8] }];
    expect(moveLesson(denseLayout, 2, 1)).toEqual([{ moduleId: 10, lessonIds: [1] }, { moduleId: 20, lessonIds: [2, 7, 8] }]);
    expect(moveLesson(denseLayout, 7, -1)).toEqual([{ moduleId: 10, lessonIds: [1, 2, 7] }, { moduleId: 20, lessonIds: [8] }]);
  });
  test("the very first and the very last cannot move further; an unknown id is null; the input is not changed", () => {
    expect(moveLesson(layout, 1, -1)).toBeNull();
    expect(moveLesson(layout, 3, 1)).toBeNull();
    expect(moveLesson(layout, 99, 1)).toBeNull();
    expect(layout[0].lessonIds).toEqual([1, 2]);
  });
  test("successful moves don't mutate the input", () => {
    const immutableLayout = [{ moduleId: 10, lessonIds: [1, 2] }, { moduleId: 20, lessonIds: [3, 4] }];
    const original = JSON.stringify(immutableLayout);
    moveLesson(immutableLayout, 2, -1);
    expect(JSON.stringify(immutableLayout)).toBe(original);
    moveLesson(immutableLayout, 2, 1);
    expect(JSON.stringify(immutableLayout)).toBe(original);
  });
});

/** A lesson's video columns: no video, no shape, unless said. */
const V = (o: Partial<VideoFields> = {}): VideoFields => ({ videoId: null, videoStatus: "none", replacedVideoId: null, durationSec: null, videoWidth: null, videoHeight: null, ...o });

describe("a lesson's video: upload, replacement, the sweep", () => {
  const none: VideoFields = V({ videoId: null, videoStatus: "none", replacedVideoId: null, durationSec: null });
  const ready: VideoFields = V({ videoId: "old", videoStatus: "ready", replacedVideoId: null, durationSec: 300 });

  test("what plays: the ready video, nothing while an upload is on its way", () => {
    expect(playableVideo(none)).toBeNull();
    expect(playableVideo(ready)).toBe("old");
    expect(playableVideo(V({ videoId: "new", videoStatus: "processing", replacedVideoId: null, durationSec: null }))).toBeNull();
  });

  test("first upload; a replacement keeps the ready video playing until the new one is ready, then deletes it", () => {
    expect(startUpload(none, "v1")).toEqual({ next: V({ videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null }), obsolete: [] });
    const replacing = startUpload(ready, "new");
    expect(replacing).toEqual({ next: V({ videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }), obsolete: [] });
    expect(playableVideo(replacing.next)).toBe("old");
    expect(completion({ ...replacing.next, kind: "video" })).toBe("watch");
    expect(settleVideo(replacing.next, "new", "processing", 0)).toEqual({ next: { ...replacing.next, videoStatus: "processing" }, obsolete: [] });
    expect(settleVideo(replacing.next, "new", "ready", 754.4)).toEqual({ next: V({ videoId: "new", videoStatus: "ready", replacedVideoId: null, durationSec: 754 }), obsolete: ["old"] });
  });

  test("settleVideo: ready on a first upload (no replacement)", () => {
    const uploading: VideoFields = V({ videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null });
    expect(settleVideo(uploading, "v1", "ready", 100)).toEqual({ next: V({ videoId: "v1", videoStatus: "ready", replacedVideoId: null, durationSec: 100 }), obsolete: [] });
  });

  test("settleVideo: status only moves forward; never downgrades a ready video", () => {
    expect(settleVideo(ready, "old", "processing", 0)).toBeNull();
    expect(settleVideo(ready, "old", "failed", 0)).toBeNull();
    expect(settleVideo(V({ videoId: "uploading", videoStatus: "uploading", replacedVideoId: null, durationSec: null }), "uploading", "processing", 0)).toEqual({ next: V({ videoId: "uploading", videoStatus: "processing", replacedVideoId: null, durationSec: null }), obsolete: [] });
  });

  test("settleVideo: ready with bad lengthSec (non-finite or ≤ 0) returns null", () => {
    const uploadingV1: VideoFields = V({ videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null });
    expect(settleVideo(uploadingV1, "v1", "ready", NaN)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", Infinity)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", 0)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", -5)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", 0.3)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", 0.6)).toEqual({ next: V({ videoId: "v1", videoStatus: "ready", replacedVideoId: null, durationSec: 1 }), obsolete: [] });
  });

  test("settleVideo: failed status", () => {
    expect(settleVideo(V({ videoId: "bad", videoStatus: "uploading", replacedVideoId: null, durationSec: null }), "bad", "failed", 0)).toEqual({ next: V({ videoId: "bad", videoStatus: "failed", replacedVideoId: null, durationSec: null }), obsolete: [] });
  });

  test("startUpload: same videoId is a no-op", () => {
    expect(startUpload(ready, "old")).toEqual({ next: ready, obsolete: [] });
    expect(playableVideo(startUpload(ready, "old").next)).toBe("old");
  });

  test("settleVideo: forward-only ordering; processing → uploading ignored", () => {
    const processing: VideoFields = V({ videoId: "v1", videoStatus: "processing", replacedVideoId: null, durationSec: null });
    expect(settleVideo(processing, "v1", "uploading", 0)).toBeNull();
  });

  test("a retry gives up the unfinished or failed upload but keeps the replaced one", () => {
    const failed: VideoFields = V({ videoId: "bad", videoStatus: "failed", replacedVideoId: "old", durationSec: 300 });
    expect(startUpload(failed, "again")).toEqual({ next: V({ videoId: "again", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }), obsolete: ["bad"] });
  });

  test("news about another video (an older upload) changes nothing", () => {
    expect(settleVideo(V({ videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }), "old", "ready", 10)).toBeNull();
  });

  test("the daily sweep: the replaced video comes back, or the lesson has no video again", () => {
    expect(abandonUpload(V({ videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }))).toEqual({ next: V({ videoId: "old", videoStatus: "ready", replacedVideoId: null, durationSec: 300 }), obsolete: ["new"] });
    expect(abandonUpload(V({ videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null }))).toEqual({ next: none, obsolete: ["v1"] });
  });

  test("abandonUpload: never destroys a ready video", () => {
    expect(abandonUpload(ready)).toEqual({ next: ready, obsolete: [] });
    expect(abandonUpload(V({ videoId: "processing", videoStatus: "processing", replacedVideoId: "old", durationSec: 100 }))).toEqual({ next: V({ videoId: "old", videoStatus: "ready", replacedVideoId: null, durationSec: 100 }), obsolete: ["processing"] });
  });

  test("switched to \"Tekst\": every video of the lesson becomes obsolete and the lesson has none", () => {
    expect(dropVideo(V({ videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }))).toEqual({ next: none, obsolete: ["new", "old"] });
    expect(dropVideo(ready)).toEqual({ next: none, obsolete: ["old"] });
    expect(dropVideo(none)).toEqual({ next: none, obsolete: [] });
  });
});

describe("a video's shape (its width and height in pixels)", () => {
  const uploading = V({ videoId: "v1", videoStatus: "uploading" });
  const playing = V({ videoId: "old", videoStatus: "ready", durationSec: 300, videoWidth: 1920, videoHeight: 1080 });
  const readyShape = (shape: Parameters<typeof settleVideo>[4]) => {
    const change = settleVideo(uploading, "v1", "ready", 100, shape);
    return change && [change.next.videoWidth, change.next.videoHeight];
  };

  test("ready stores the shape of the video, upright or wide", () => {
    expect(settleVideo(uploading, "v1", "ready", 100, { width: 1080, height: 1920 })).toEqual({
      next: V({ videoId: "v1", videoStatus: "ready", durationSec: 100, videoWidth: 1080, videoHeight: 1920 }),
      obsolete: [],
    });
    expect(readyShape({ width: 1920, height: 1080 })).toEqual([1920, 1080]);
    expect(readyShape({ width: 1000, height: 1000 })).toEqual([1000, 1000]);
  });

  test("a shape that cannot be one (0, negative, not a number, over 10000, a fraction, one side bad, none given) is stored as null for both", () => {
    for (const shape of [
      { width: 0, height: 0 }, { width: 1920, height: 0 }, { width: 0, height: 1080 }, { width: -1920, height: 1080 }, { width: 1920, height: -1 },
      { width: NaN, height: 1080 }, { width: 1920, height: NaN }, { width: Infinity, height: 1080 }, { width: 10_001, height: 1080 }, { width: 1920, height: 10_001 },
      { width: 1920.5, height: 1080 }, { width: 1920, height: 1080.25 }, null, undefined,
    ])
      expect(readyShape(shape), JSON.stringify(shape)).toEqual([null, null]);
    expect(settleVideo(uploading, "v1", "ready", 100)?.next).toEqual(V({ videoId: "v1", videoStatus: "ready", durationSec: 100 })); // the argument left out
  });

  test("the limits: 1 and 10000 are sizes, 0 and 10001 are not", () => {
    expect(readyShape({ width: 1, height: 10_000 })).toEqual([1, 10_000]);
    expect(readyShape({ width: 10_000, height: 1 })).toEqual([10_000, 1]);
    expect(validShape({ width: 10_001, height: 1 })).toBeNull();
    expect(validShape({ width: 1, height: 0 })).toBeNull();
    expect(validShape(null)).toBeNull();
    expect(validShape({ width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
  });

  test("videoAspect: width / height of a usable shape, else 16 / 9 (the player's frame and the lesson page's column)", () => {
    expect(videoAspect({ width: 1080, height: 1920 })).toBe(0.5625);
    expect(videoAspect({ width: 1440, height: 1080 })).toBe(4 / 3);
    expect(videoAspect({ width: 1000, height: 1000 })).toBe(1);
    for (const bad of [null, undefined, { width: 0, height: 1080 }, { width: 1920.5, height: 1080 }, { width: 20_000, height: 1080 }]) expect(videoAspect(bad), JSON.stringify(bad)).toBe(16 / 9);
  });

  test("a status that is not ready leaves the stored shape alone, whatever shape comes with it", () => {
    const replacing = startUpload(playing, "new").next;
    expect(replacing).toMatchObject({ videoWidth: 1920, videoHeight: 1080 }); // the old video plays on with its shape
    for (const status of ["uploading", "processing", "failed"] as const)
      expect(settleVideo(replacing, "new", status, 0, { width: 1080, height: 1920 })?.next, status).toMatchObject({ videoStatus: status, videoWidth: 1920, videoHeight: 1080 });
    expect(settleVideo(V({ videoId: "v1", videoStatus: "processing" }), "v1", "processing", 0, { width: 1080, height: 1920 })?.next).toMatchObject({ videoWidth: null, videoHeight: null });
  });

  test("a replacement keeps the old shape until the new video is ready; then the new shape takes its place", () => {
    const replacing = startUpload(playing, "new").next;
    const processing = settleVideo(replacing, "new", "processing", 0)!.next;
    expect(processing).toMatchObject({ videoStatus: "processing", replacedVideoId: "old", videoWidth: 1920, videoHeight: 1080 });
    expect(settleVideo(processing, "new", "ready", 60, { width: 1080, height: 1920 })).toEqual({
      next: V({ videoId: "new", videoStatus: "ready", durationSec: 60, videoWidth: 1080, videoHeight: 1920 }),
      obsolete: ["old"],
    });
  });

  test("a replacement that is ready with no usable shape has none: the old video, and its shape, are gone", () => {
    const processing = settleVideo(startUpload(playing, "new").next, "new", "processing", 0)!.next;
    expect(settleVideo(processing, "new", "ready", 60, { width: 0, height: 0 })?.next).toMatchObject({ videoId: "new", videoWidth: null, videoHeight: null });
  });

  test("a failed upload keeps the shape of the replaced video; a retry too", () => {
    const failed = settleVideo(startUpload(playing, "new").next, "new", "failed", 0)!.next;
    expect(failed).toMatchObject({ videoStatus: "failed", replacedVideoId: "old", videoWidth: 1920, videoHeight: 1080 });
    expect(startUpload(failed, "again").next).toMatchObject({ videoStatus: "uploading", replacedVideoId: "old", videoWidth: 1920, videoHeight: 1080 });
  });

  test("the daily sweep gives the replaced video back with its shape; a first upload had none", () => {
    const stuck = startUpload(playing, "new").next;
    expect(abandonUpload(stuck)).toEqual({ next: playing, obsolete: ["new"] });
    expect(abandonUpload(V({ videoId: "v1", videoStatus: "uploading" }))).toEqual({ next: V(), obsolete: ["v1"] });
  });

  test("a ready video is never abandoned, shape and all", () => {
    expect(abandonUpload(playing)).toEqual({ next: playing, obsolete: [] });
  });

  test("switched to \"Tekst\": the shape goes with the videos", () => {
    expect(dropVideo(playing)).toEqual({ next: V(), obsolete: ["old"] });
    expect(dropVideo(startUpload(playing, "new").next)).toEqual({ next: V(), obsolete: ["new", "old"] });
  });

  test("a repeated answer for a ready video changes nothing (same length, same shape)", () => {
    expect(settleVideo(playing, "old", "ready", 300, { width: 1920, height: 1080 })?.next).toEqual(playing);
  });
});

describe("completing a lesson: the kind is explicit (controller ruling)", () => {
  const none: VideoFields = V({ videoId: null, videoStatus: "none", replacedVideoId: null, durationSec: null });

  test("a text lesson is completed with \"Märgi tehtuks\"", () => {
    expect(completion({ ...none, kind: "text" })).toBe("mark");
  });

  test("a video lesson is completed by watching a playable video (90 %), and by nothing else", () => {
    expect(completion({ ...V({ videoId: "v", videoStatus: "ready", replacedVideoId: null, durationSec: 300 }), kind: "video" })).toBe("watch");
    for (const videoStatus of ["none", "uploading", "processing", "failed"] as const)
      expect(completion({ ...none, videoId: videoStatus === "none" ? null : "v", videoStatus, kind: "video" }), videoStatus).toBe("wait");
  });

  test("ready video with null or 0 duration is not watchable → wait", () => {
    expect(completion({ ...V({ videoId: "v", videoStatus: "ready", replacedVideoId: null, durationSec: null }), kind: "video" })).toBe("wait");
    expect(completion({ ...V({ videoId: "v", videoStatus: "ready", replacedVideoId: null, durationSec: 0 }), kind: "video" })).toBe("wait");
  });
  // That a waiting video lesson keeps the next one locked is checked end to end in Task 7's DB test (the API refuses to complete it).
});
