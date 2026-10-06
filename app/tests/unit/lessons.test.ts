import { describe, expect, test } from "vitest";
import {
  abandonUpload, completion, courseProgress, dropVideo, formatDuration, isWatched, lessonStates, moveLesson, nextLessonAfter, playableVideo, resumeAt,
  settleVideo, startUpload, type OrderedLesson, type VideoFields,
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

describe("a lesson's video: upload, replacement, the sweep", () => {
  const none: VideoFields = { videoId: null, videoStatus: "none", replacedVideoId: null, durationSec: null };
  const ready: VideoFields = { videoId: "old", videoStatus: "ready", replacedVideoId: null, durationSec: 300 };

  test("what plays: the ready video, nothing while an upload is on its way", () => {
    expect(playableVideo(none)).toBeNull();
    expect(playableVideo(ready)).toBe("old");
    expect(playableVideo({ videoId: "new", videoStatus: "processing", replacedVideoId: null, durationSec: null })).toBeNull();
  });

  test("first upload; a replacement keeps the ready video playing until the new one is ready, then deletes it", () => {
    expect(startUpload(none, "v1")).toEqual({ next: { videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null }, obsolete: [] });
    const replacing = startUpload(ready, "new");
    expect(replacing).toEqual({ next: { videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }, obsolete: [] });
    expect(playableVideo(replacing.next)).toBe("old");
    expect(completion({ ...replacing.next, kind: "video" })).toBe("watch");
    expect(settleVideo(replacing.next, "new", "processing", 0)).toEqual({ next: { ...replacing.next, videoStatus: "processing" }, obsolete: [] });
    expect(settleVideo(replacing.next, "new", "ready", 754.4)).toEqual({ next: { videoId: "new", videoStatus: "ready", replacedVideoId: null, durationSec: 754 }, obsolete: ["old"] });
  });

  test("settleVideo: ready on a first upload (no replacement)", () => {
    const uploading: VideoFields = { videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null };
    expect(settleVideo(uploading, "v1", "ready", 100)).toEqual({ next: { videoId: "v1", videoStatus: "ready", replacedVideoId: null, durationSec: 100 }, obsolete: [] });
  });

  test("settleVideo: status only moves forward; never downgrades a ready video", () => {
    expect(settleVideo(ready, "old", "processing", 0)).toBeNull();
    expect(settleVideo(ready, "old", "failed", 0)).toBeNull();
    expect(settleVideo({ videoId: "uploading", videoStatus: "uploading", replacedVideoId: null, durationSec: null }, "uploading", "processing", 0)).toEqual({ next: { videoId: "uploading", videoStatus: "processing", replacedVideoId: null, durationSec: null }, obsolete: [] });
  });

  test("settleVideo: ready with bad lengthSec (non-finite or ≤ 0) returns null", () => {
    const uploadingV1: VideoFields = { videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null };
    expect(settleVideo(uploadingV1, "v1", "ready", NaN)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", Infinity)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", 0)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", -5)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", 0.3)).toBeNull();
    expect(settleVideo(uploadingV1, "v1", "ready", 0.6)).toEqual({ next: { videoId: "v1", videoStatus: "ready", replacedVideoId: null, durationSec: 1 }, obsolete: [] });
  });

  test("settleVideo: failed status", () => {
    expect(settleVideo({ videoId: "bad", videoStatus: "uploading", replacedVideoId: null, durationSec: null }, "bad", "failed", 0)).toEqual({ next: { videoId: "bad", videoStatus: "failed", replacedVideoId: null, durationSec: null }, obsolete: [] });
  });

  test("startUpload: same videoId is a no-op", () => {
    expect(startUpload(ready, "old")).toEqual({ next: ready, obsolete: [] });
    expect(playableVideo(startUpload(ready, "old").next)).toBe("old");
  });

  test("settleVideo: forward-only ordering; processing → uploading ignored", () => {
    const processing: VideoFields = { videoId: "v1", videoStatus: "processing", replacedVideoId: null, durationSec: null };
    expect(settleVideo(processing, "v1", "uploading", 0)).toBeNull();
  });

  test("a retry gives up the unfinished or failed upload but keeps the replaced one", () => {
    const failed: VideoFields = { videoId: "bad", videoStatus: "failed", replacedVideoId: "old", durationSec: 300 };
    expect(startUpload(failed, "again")).toEqual({ next: { videoId: "again", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }, obsolete: ["bad"] });
  });

  test("news about another video (an older upload) changes nothing", () => {
    expect(settleVideo({ videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 }, "old", "ready", 10)).toBeNull();
  });

  test("the daily sweep: the replaced video comes back, or the lesson has no video again", () => {
    expect(abandonUpload({ videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 })).toEqual({ next: { videoId: "old", videoStatus: "ready", replacedVideoId: null, durationSec: 300 }, obsolete: ["new"] });
    expect(abandonUpload({ videoId: "v1", videoStatus: "uploading", replacedVideoId: null, durationSec: null })).toEqual({ next: none, obsolete: ["v1"] });
  });

  test("abandonUpload: never destroys a ready video", () => {
    expect(abandonUpload(ready)).toEqual({ next: ready, obsolete: [] });
    expect(abandonUpload({ videoId: "processing", videoStatus: "processing", replacedVideoId: "old", durationSec: 100 })).toEqual({ next: { videoId: "old", videoStatus: "ready", replacedVideoId: null, durationSec: 100 }, obsolete: ["processing"] });
  });

  test("switched to \"Tekst\": every video of the lesson becomes obsolete and the lesson has none", () => {
    expect(dropVideo({ videoId: "new", videoStatus: "uploading", replacedVideoId: "old", durationSec: 300 })).toEqual({ next: none, obsolete: ["new", "old"] });
    expect(dropVideo(ready)).toEqual({ next: none, obsolete: ["old"] });
    expect(dropVideo(none)).toEqual({ next: none, obsolete: [] });
  });
});

describe("completing a lesson: the kind is explicit (controller ruling)", () => {
  const none: VideoFields = { videoId: null, videoStatus: "none", replacedVideoId: null, durationSec: null };

  test("a text lesson is completed with \"Märgi tehtuks\"", () => {
    expect(completion({ ...none, kind: "text" })).toBe("mark");
  });

  test("a video lesson is completed by watching a playable video (90 %), and by nothing else", () => {
    expect(completion({ videoId: "v", videoStatus: "ready", replacedVideoId: null, durationSec: 300, kind: "video" })).toBe("watch");
    for (const videoStatus of ["none", "uploading", "processing", "failed"] as const)
      expect(completion({ ...none, videoId: videoStatus === "none" ? null : "v", videoStatus, kind: "video" }), videoStatus).toBe("wait");
  });

  test("ready video with null or 0 duration is not watchable → wait", () => {
    expect(completion({ videoId: "v", videoStatus: "ready", replacedVideoId: null, durationSec: null, kind: "video" })).toBe("wait");
    expect(completion({ videoId: "v", videoStatus: "ready", replacedVideoId: null, durationSec: 0, kind: "video" })).toBe("wait");
  });
  // That a waiting video lesson keeps the next one locked is checked end to end in Task 7's DB test (the API refuses to complete it).
});
