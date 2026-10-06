import type { LessonCleanup } from "./admin-lessons";
import type { BunnyApi } from "./bunny";
import { logFailure } from "./log";
import type { FileStore } from "./media";

// What a deleted lesson leaves outside the database: its Bunny videos (the current one and a replaced one) and its files in the
// store. Removed after the database row is gone; a failure is logged (no ids, no keys) and the rest goes on — an orphan only
// costs storage.

/** Deletes these Bunny videos one by one; never throws. */
export async function deleteBunnyVideos(api: BunnyApi, ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await api.deleteVideo(id);
    } catch (e) {
      logFailure("[lesson] video not deleted", e);
    }
  }
}

/** Removes a deleted lesson's videos and files. Without Bunny or a store that part is skipped. Never throws. */
export async function removeLessonMedia(cleanup: LessonCleanup, deps: { bunny: BunnyApi | null; files: FileStore | null }): Promise<void> {
  if (deps.bunny) await deleteBunnyVideos(deps.bunny, cleanup.videoIds);
  if (!deps.files) return;
  for (const key of cleanup.fileKeys) {
    try {
      await deps.files.delete(key);
    } catch (e) {
      logFailure("[lesson] file not deleted", e);
    }
  }
}
