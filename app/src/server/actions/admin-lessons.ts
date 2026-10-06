"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Db } from "@/db/client";
import { parseRowId } from "@/lib/row-id";
import {
  addLessonForm, addModuleForm, deleteLessonFileForm, deleteLessonForm, deleteModuleForm, moveLessonForm, moveModuleForm, renameModuleForm, saveLessonForm,
  setLessonHiddenForm, setLessonKindForm, type LessonCleanup,
} from "../admin-lessons";
import { adminAction } from "../auth";
import { bunnyApi, bunnyConfig } from "../bunny";
import type { EditResult } from "../edit-check";
import { deleteBunnyVideos, removeLessonMedia } from "../lesson-media";
import { logFailure } from "../log";
import { mediaStore } from "../media-store";
import { revalidatePublic } from "../public-cache";

// "Moodulid ja õppetunnid" server actions: every export is wrapped in adminAction (tests/unit/admin-guards.test.ts). The work is in
// ../admin-lessons.ts. Module titles show on the public course page, so their changes revalidate the course pages; lessons are
// only in the account (its JSON is never cached), so they refresh the open admin page only.

async function run(what: string, publicChange: boolean, work: (db: Db) => Promise<EditResult>): Promise<EditResult> {
  try {
    const result = await work(getDb());
    if (result.ok) {
      if (publicChange) revalidatePublic({ kind: "courses" });
      refresh();
    }
    return result;
  } catch (e) {
    logFailure(`[admin] ${what} failed`, e);
    return { ok: false, error: "server" };
  }
}

/**
 * What comes after a stored change, outside the database (Bunny, the file store): deleteBunnyVideos and removeLessonMedia never
 * throw, and whatever else might (reading the settings) is logged here too, so the admin's change, already stored, is never
 * answered as a failure.
 */
async function afterwards(what: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (e) {
    logFailure(`[admin] ${what} cleanup failed`, e);
  }
}

/** The course id a form names (the address to go back to; lib/row-id.ts parseRowId); null when it is not one. */
const courseOf = (fd: FormData): number | null => parseRowId(String(fd.get("courseId") ?? ""));

const media = () => {
  const config = bunnyConfig();
  return { bunny: config ? bunnyApi(config) : null, files: mediaStore() };
};

export const addModule = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => run("module add", true, (db) => addModuleForm(db, formData)));
export const renameModule = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => run("module rename", true, (db) => renameModuleForm(db, formData)));
export const moveModuleInList = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => run("module move", true, (db) => moveModuleForm(db, formData)));
export const deleteModule = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => run("module delete", true, (db) => deleteModuleForm(db, formData)));

/** "Lisa õppetund": the new lesson opens in the drawer (fields moduleId, courseId, titleEt). */
export const addLesson = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => {
  const result = await run("lesson add", false, (db) => addLessonForm(db, formData));
  const course = courseOf(formData);
  if (result.ok && result.created && course) redirect(`/admin/koolitused/${course}?oppetund=${result.id}`);
  return result;
});

export const saveLesson = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => run("lesson save", false, (db) => saveLessonForm(db, formData)));
export const moveLessonInList = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => run("lesson move", false, (db) => moveLessonForm(db, formData)));
export const setLessonHidden = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => run("lesson visibility", false, (db) => setLessonHiddenForm(db, formData)));

/** "Õppetunni liik" (to Tekst after "Video kustutatakse. Jätkan?"): fields id, kind. The videos it drops are deleted from Bunny. */
export const setLessonKind = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => {
  let obsolete: string[] = [];
  const result = await run("lesson kind", false, async (db) => {
    const done = await setLessonKindForm(db, formData);
    obsolete = done.obsolete;
    return done.result;
  });
  if (result.ok && obsolete.length)
    await afterwards("lesson kind", async () => {
      const config = bunnyConfig();
      if (config) await deleteBunnyVideos(bunnyApi(config), obsolete);
    });
  return result;
});

/** "Kustuta õppetund" (after its confirmation): the row, then its videos and files; back to the course with the drawer closed. */
export const deleteLesson = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => {
  let cleanup: LessonCleanup = { videoIds: [], fileKeys: [] };
  const result = await run("lesson delete", false, async (db) => {
    const done = await deleteLessonForm(db, formData);
    cleanup = done.cleanup;
    return done.result;
  });
  if (result.ok) await afterwards("lesson delete", () => removeLessonMedia(cleanup, media()));
  const course = courseOf(formData);
  if (result.ok && course) redirect(`/admin/koolitused/${course}`);
  return result;
});

/** A file's "Eemalda": the row, then the stored object. */
export const deleteLessonFile = adminAction(async (_admin, _prev: EditResult | null, formData: FormData) => {
  let key: string | null = null;
  const result = await run("lesson file delete", false, async (db) => {
    const done = await deleteLessonFileForm(db, formData);
    key = done.key;
    return done.result;
  });
  const stored = key;
  if (result.ok && stored) await afterwards("lesson file delete", () => removeLessonMedia({ videoIds: [], fileKeys: [stored] }, { bunny: null, files: mediaStore() }));
  return result;
});
