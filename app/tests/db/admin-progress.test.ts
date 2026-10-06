import { and, eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { clients, courseAccess, courseModules, courses, lessonProgress, lessons } from "@/db/schema";
import { clientDetail, clientViewInfo, unlockNext, unlockNextForm } from "@/server/admin-clients";
import { makeTestDb } from "./helpers";

const NOW = new Date("2026-10-06T10:00:00Z");
let db: Db;
let w: Awaited<ReturnType<typeof world>>;

/** A student with access to an e-course of three lessons (the first done), and a contact course. */
async function world() {
  const base = { level: "basic" as const, summary: { et: "" }, body: { et: "" } };
  const [course] = await db.insert(courses).values({ ...base, slug: "veeb", type: "e_learning", title: { et: "Veeb" } }).returning();
  const [contact] = await db.insert(courses).values({ ...base, slug: "kontakt", type: "contact", title: { et: "Kontakt" } }).returning();
  const [m] = await db.insert(courseModules).values({ courseId: course.id, position: 1, title: { et: "M" } }).returning();
  const [l1] = await db.insert(lessons).values({ moduleId: m.id, position: 1, title: { et: "Üks" } }).returning();
  const [l2] = await db.insert(lessons).values({ moduleId: m.id, position: 2, title: { et: "Kaks" } }).returning();
  const [l3] = await db.insert(lessons).values({ moduleId: m.id, position: 3, title: { et: "Kolm" } }).returning();
  const [client] = await db.insert(clients).values({ email: "kati@example.test", name: "Kati", locale: "ru" }).returning();
  await db.insert(courseAccess).values({ clientId: client.id, courseId: course.id, grantedBy: "admin@example.test", expiresAt: new Date(NOW.getTime() + 86_400_000) });
  await db.insert(lessonProgress).values({ clientId: client.id, lessonId: l1.id, watchedSec: 100, doneAt: NOW });
  return { course, contact, l1, l2, l3, client };
}

beforeEach(async () => {
  db = await makeTestDb();
  w = await world();
});

const unlock = (over: Partial<Parameters<typeof unlockNext>[1]> = {}) =>
  unlockNext(db, { clientId: w.client.id, courseId: w.course.id, lessonId: w.l3.id, by: "admin@example.test", now: NOW, ...over });

test("the drawer: done of total per e-course, and its first locked lesson", async () => {
  const detail = await clientDetail(db, w.client.id, NOW);
  expect(detail!.access[0]).toMatchObject({ courseId: w.course.id, progress: { done: 1, total: 3 }, nextLocked: { id: w.l3.id, title: { et: "Kolm" } } });
});

test("“Ava järgmine õppetund” opens exactly that lesson (unlocked_by = the admin); then nothing is locked", async () => {
  expect(await unlock()).toEqual({ ok: true });
  const [p] = await db.select().from(lessonProgress).where(and(eq(lessonProgress.clientId, w.client.id), eq(lessonProgress.lessonId, w.l3.id)));
  expect([p.unlockedBy, p.doneAt, p.watchedSec]).toEqual(["admin@example.test", null, 0]);
  expect((await clientDetail(db, w.client.id, NOW))!.access[0].nextLocked).toBeNull();
});

test("a lesson that is open by now changes nothing; unknown lesson or student: notFound; a contact course: course; bad fields: invalid", async () => {
  expect(await unlock({ lessonId: w.l2.id })).toEqual({ ok: true });
  expect(await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, w.l2.id))).toHaveLength(0);
  expect(await unlock({ lessonId: 999999 })).toEqual({ ok: false, error: "notFound" });
  expect(await unlock({ clientId: 999999 })).toEqual({ ok: false, error: "notFound" });
  expect(await unlock({ courseId: w.contact.id })).toEqual({ ok: false, error: "course" });
  const fd = new FormData();
  fd.set("clientId", String(w.client.id));
  fd.set("courseId", "x");
  fd.set("lessonId", String(w.l3.id));
  expect(await unlockNextForm(db, fd, "admin@example.test", NOW)).toEqual({ ok: false, error: "invalid" });
});

test("the read-only course view's banner name and language", async () => {
  expect(await clientViewInfo(db, w.client.id)).toEqual({ label: "Kati", locale: "ru" });
  expect(await clientViewInfo(db, 999999)).toBeNull();
});
