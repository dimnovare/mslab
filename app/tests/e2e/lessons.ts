import { join } from "node:path";
import { localStore } from "../../src/server/media-local";
import { accountCourseSlug, onLocalDb } from "./fixtures";

// The student's lesson pages in the e2e run (account-lessons.spec.ts, phase 3a Task 9): a course of lessons written straight to the
// LOCAL database for one sample address, and its file in the local store of the e2e run's server.

/** The local database for rows no public page shows. */
const localDb = <T>(work: Parameters<typeof onLocalDb<T>>[0]): Promise<T> => onLocalDb(work, { marksPages: false });

/** The e2e run's server keeps lesson files here (server/media-local.ts: `next dev`, and the local production build with MEDIA_LOCAL=1). */
const files = () => localStore(join(process.cwd(), ".media-local"));

export type LessonCourse = { clientId: number; slug: string; lessons: { video: number; text: number; last: number }; fileId: number; fileName: string; fileKey: string };

/** A small PDF the student downloads (the local store of the e2e run's server: app/.media-local). */
const PDF = new TextEncoder().encode("%PDF-1.4\n% e2e lesson file\n");

/**
 * A client with six months of access to an e-course of her own (`e2e-konto-<label>-<project>`, not published; removeClientRows deletes
 * it with its modules, lessons, files and progress), the terms of version "1" accepted (takeTerms sets that version):
 * - module "Alustame": lesson 1, a video lesson with a ready video of 125 s on the fake Bunny (any id: the fake's player checks only
 *   the token); lesson 2, a text lesson (kind 'text'), with the PDF "Juhend.pdf";
 * - module "Edasi": lesson 3, a text lesson.
 * The PDF's store key comes back too (removeLessonFile deletes it).
 */
export async function insertLessonCourse(email: string, opts: { locale?: "et" | "ru" } = {}): Promise<LessonCourse> {
  const slug = accountCourseSlug(email);
  const key = `lessons/${crypto.randomUUID()}.pdf`;
  await files().put(key, PDF.buffer.slice(0) as ArrayBuffer, "application/pdf");
  return localDb(async (sql) => {
    const [client] = await sql<{ id: number }[]>`insert into clients (email, locale) values (${email}, ${opts.locale ?? "et"}) returning id`;
    const [course] = await sql<{ id: number }[]>`
      insert into courses (slug, type, level, title, summary, body, price, access_months, published)
      values (${slug}, 'e_learning', 'basic', ${sql.json({ et: "E2E õppetunnid", ru: "E2E уроки" })}, ${sql.json({ et: "" })}, ${sql.json({ et: "" })}, 9500, 6, false) returning id`;
    const [m1] = await sql<{ id: number }[]>`insert into course_modules (course_id, position, title) values (${course.id}, 1, ${sql.json({ et: "Alustame", ru: "Начинаем" })}) returning id`;
    const [m2] = await sql<{ id: number }[]>`insert into course_modules (course_id, position, title) values (${course.id}, 2, ${sql.json({ et: "Edasi", ru: "Дальше" })}) returning id`;
    const [video] = await sql<{ id: number }[]>`
      insert into lessons (module_id, position, title, body, kind, video_id, video_status, duration_sec)
      values (${m1.id}, 1, ${sql.json({ et: "Esimene tund", ru: "Первый урок" })}, ${sql.json({ et: "Vaata video lõpuni." })}, 'video', ${crypto.randomUUID()}, 'ready', 125) returning id`;
    const [text] = await sql<{ id: number }[]>`
      insert into lessons (module_id, position, title, body, kind) values (${m1.id}, 2, ${sql.json({ et: "Teine tund" })}, ${sql.json({ et: "Loe juhend läbi.\n\nSiis märgi tehtuks." })}, 'text') returning id`;
    const [last] = await sql<{ id: number }[]>`insert into lessons (module_id, position, title, kind) values (${m2.id}, 1, ${sql.json({ et: "Kolmas tund" })}, 'text') returning id`;
    const [file] = await sql<{ id: number }[]>`
      insert into lesson_files (lesson_id, position, name, r2_key, size, content_type) values (${text.id}, 1, 'Juhend.pdf', ${key}, ${PDF.length}, 'application/pdf') returning id`;
    await sql`insert into course_access (client_id, course_id, granted_by, expires_at) values (${client.id}, ${course.id}, 'e2e', now() + interval '6 months')`;
    await sql`insert into terms_acceptances (client_id, course_id, terms_version) values (${client.id}, ${course.id}, '1')`;
    return { clientId: client.id, slug, lessons: { video: video.id, text: text.id, last: last.id }, fileId: file.id, fileName: "Juhend.pdf", fileKey: key };
  });
}

/** Deletes a lesson file insertLessonCourse stored (its rows go with removeClientRows). */
export async function removeLessonFile(key: string): Promise<void> {
  await files().delete(key);
}

/** Lesson `lessonId` done for the student, as a finished video or "Märgi tehtuks" leaves it. */
export async function markDone(clientId: number, lessonId: number): Promise<void> {
  await localDb((sql) => sql`insert into lesson_progress (client_id, lesson_id, watched_sec, done_at) values (${clientId}, ${lessonId}, 125, now())`);
}

/** The video lesson's video gone back to "not uploaded yet" (the admin has not uploaded it): "Video lisandub peagi". */
export async function dropVideo(lessonId: number): Promise<void> {
  await localDb((sql) => sql`update lessons set video_status = 'none', video_id = null, duration_sec = null, video_width = null, video_height = null where id = ${lessonId}`);
}

/** The ready video's picture size as Bunny reported it (the player's frame takes its shape). */
export async function setVideoShape(lessonId: number, width: number, height: number): Promise<void> {
  await localDb((sql) => sql`update lessons set video_width = ${width}, video_height = ${height} where id = ${lessonId}`);
}
