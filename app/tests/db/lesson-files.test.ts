import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { courseModules, courses, lessonFiles, lessons } from "@/db/schema";
import { addLessonFile } from "@/server/lesson-files";
import { MAX_IMAGE_BYTES, UploadError } from "@/server/media";
import { fakeMediaStore } from "../fakes";
import { makeTestDb } from "./helpers";

let db: Db;
let lessonId: number;
beforeEach(async () => {
  db = await makeTestDb();
  const [c] = await db.insert(courses).values({ slug: "veeb", type: "e_learning", level: "basic", title: { et: "V" }, summary: { et: "" }, body: { et: "" } }).returning();
  const [m] = await db.insert(courseModules).values({ courseId: c.id, position: 1, title: { et: "M" } }).returning();
  [{ id: lessonId }] = await db.insert(lessons).values({ moduleId: m.id, position: 1, title: { et: "L" } }).returning();
});

const pdf = (size = 20, name = "Juhend.pdf") => {
  const bytes = new Uint8Array(size);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return new File([bytes], name, { type: "application/pdf" });
};
const reason = (e: unknown) => (e instanceof UploadError ? e.reason : e);

test("a PDF is stored under lessons/<uuid>.pdf with its type and download name, and listed last", async () => {
  const store = fakeMediaStore();
  const first = await addLessonFile(db, store, lessonId, pdf(20, "Juhend.pdf"));
  await addLessonFile(db, store, lessonId, pdf(30, "Lisa.pdf"));
  expect(first).toEqual({ id: expect.any(Number), name: "Juhend.pdf", size: 20, contentType: "application/pdf" });
  const rows = await db.select().from(lessonFiles).orderBy(lessonFiles.position);
  expect(rows.map((r) => [r.position, r.name, r.size])).toEqual([[1, "Juhend.pdf", 20], [2, "Lisa.pdf", 30]]);
  expect(rows[0].r2Key).toMatch(/^lessons\/[0-9a-f-]{36}\.pdf$/);
  const stored = store.objects.get(rows[0].r2Key)!;
  expect([stored.contentType, stored.disposition]).toEqual(["application/pdf", `attachment; filename="Juhend.pdf"; filename*=UTF-8''Juhend.pdf`]);
});

test("refused: another type, over 4 MB, empty, bytes that are not a PDF; an unknown lesson stores nothing", async () => {
  const store = fakeMediaStore();
  expect(reason(await addLessonFile(db, store, lessonId, new File(["<html>"], "x.html", { type: "text/html" })).catch((e) => e))).toBe("type");
  expect(reason(await addLessonFile(db, store, lessonId, pdf(MAX_IMAGE_BYTES + 1)).catch((e) => e))).toBe("size");
  expect(reason(await addLessonFile(db, store, lessonId, new File([], "x.pdf", { type: "application/pdf" })).catch((e) => e))).toBe("empty");
  expect(reason(await addLessonFile(db, store, lessonId, new File(["not a pdf"], "x.pdf", { type: "application/pdf" })).catch((e) => e))).toBe("content");
  expect(await addLessonFile(db, store, 999999, pdf())).toBe("notFound");
  expect(store.objects.size).toBe(0);
  expect(await db.select().from(lessonFiles)).toHaveLength(0);
});

test("the type is the file's own: a .docx sent without a type is stored as .docx, an image as its extension; the visitor's file name is only the download name", async () => {
  const store = fakeMediaStore();
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const docx = await addLessonFile(db, store, lessonId, new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])], "Ülesanne ../1.DOCX", { type: "" }));
  const jpeg = await addLessonFile(db, store, lessonId, new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "foto.jpeg", { type: "image/jpeg" }));
  expect(docx).toEqual({ id: expect.any(Number), name: "1.DOCX", size: 6, contentType: DOCX });
  expect(jpeg).toEqual({ id: expect.any(Number), name: "foto.jpeg", size: 4, contentType: "image/jpeg" });
  const rows = await db.select().from(lessonFiles).orderBy(lessonFiles.position);
  expect(rows.map((r) => r.r2Key)).toEqual([expect.stringMatching(/^lessons\/[0-9a-f-]{36}\.docx$/), expect.stringMatching(/^lessons\/[0-9a-f-]{36}\.jpg$/)]);
  expect(rows.map((r) => r.contentType)).toEqual([DOCX, "image/jpeg"]);
  expect([...store.objects.keys()].sort()).toEqual(rows.map((r) => r.r2Key).sort());
  expect(store.objects.get(rows[0].r2Key)!.disposition).toBe(`attachment; filename="1.DOCX"; filename*=UTF-8''1.DOCX`);
});

test("positions count per lesson", async () => {
  const [m] = await db.select().from(courseModules);
  const [other] = await db.insert(lessons).values({ moduleId: m.id, position: 2, title: { et: "L2" } }).returning();
  const store = fakeMediaStore();
  await addLessonFile(db, store, lessonId, pdf());
  await addLessonFile(db, store, other.id, pdf());
  await addLessonFile(db, store, lessonId, pdf());
  const rows = await db.select().from(lessonFiles).orderBy(lessonFiles.lessonId, lessonFiles.position);
  expect(rows.map((r) => [r.lessonId === lessonId, r.position])).toEqual([[true, 1], [true, 2], [false, 1]]);
});
