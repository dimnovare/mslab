import { and, eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { clients, courseAccess, courseModules, courses, lessonProgress, lessons, registrations } from "@/db/schema";
import { clientDetail, clientViewInfo, unlockNext, unlockNextForm } from "@/server/admin-clients";
import { courseOutline } from "@/server/lesson-outline";
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

/** Her progress rows of one lesson. */
const rows = (lessonId: number, clientId = w.client.id) =>
  db.select().from(lessonProgress).where(and(eq(lessonProgress.clientId, clientId), eq(lessonProgress.lessonId, lessonId)));

test("only with an ACTIVE access: ended, run out or never given → notFound and no progress row (it would apply after a later grant); a draft course is fine", async () => {
  expect(w.course.published).toBe(false); // the course of this world is a draft, and opening still works (the other tests)
  const held = eq(courseAccess.clientId, w.client.id);

  await db.update(courseAccess).set({ revokedAt: NOW }).where(held); // ended by an admin
  expect(await unlock()).toEqual({ ok: false, error: "notFound" });
  expect(await rows(w.l3.id)).toHaveLength(0);

  await db.update(courseAccess).set({ revokedAt: null, expiresAt: new Date(NOW.getTime() - 1) }).where(held); // run out
  expect(await unlock()).toEqual({ ok: false, error: "notFound" });
  expect(await rows(w.l3.id)).toHaveLength(0);
  await db.update(courseAccess).set({ expiresAt: NOW }).where(held); // the very moment it ends
  expect(await unlock()).toEqual({ ok: false, error: "notFound" });
  expect(await rows(w.l3.id)).toHaveLength(0);

  const [other] = await db.insert(clients).values({ email: "mari@example.test" }).returning(); // no access row at all
  expect(await unlock({ clientId: other.id })).toEqual({ ok: false, error: "notFound" });
  expect(await rows(w.l3.id, other.id)).toHaveLength(0);

  await db.update(courseAccess).set({ expiresAt: new Date(NOW.getTime() + 1) }).where(held); // open again: now it works
  expect(await unlock()).toEqual({ ok: true });
  expect(await rows(w.l3.id)).toHaveLength(1);
});

test("a hidden lesson is not counted and is no target; hiding the first locked one leaves nothing to open", async () => {
  const [hidden] = await db.insert(lessons).values({ moduleId: w.l1.moduleId, position: 4, title: { et: "Peidus" }, hidden: true }).returning();
  expect((await clientDetail(db, w.client.id, NOW))!.access[0]).toMatchObject({ progress: { done: 1, total: 3 }, nextLocked: { id: w.l3.id } });
  expect(await unlock({ lessonId: hidden.id })).toEqual({ ok: false, error: "notFound" });
  expect(await rows(hidden.id)).toHaveLength(0);

  await db.update(lessons).set({ hidden: true }).where(eq(lessons.id, w.l3.id));
  expect((await clientDetail(db, w.client.id, NOW))!.access[0]).toMatchObject({ progress: { done: 1, total: 2 }, nextLocked: null });
  expect(await unlock()).toEqual({ ok: false, error: "notFound" }); // the one the drawer showed is hidden by now
  expect(await rows(w.l3.id)).toHaveLength(0);
});

test("opens only that lesson: with four, opening the third leaves the fourth locked (the next to open)", async () => {
  const [l4] = await db.insert(lessons).values({ moduleId: w.l1.moduleId, position: 4, title: { et: "Neli" } }).returning();
  expect((await clientDetail(db, w.client.id, NOW))!.access[0].nextLocked).toEqual({ id: w.l3.id, title: { et: "Kolm" } });
  expect(await unlock()).toEqual({ ok: true });
  expect(await rows(l4.id)).toHaveLength(0);
  expect((await courseOutline(db, w.course.id, w.client.id)).lessons.map((l) => l.state)).toEqual(["done", "current", "current", "locked"]);
  expect((await clientDetail(db, w.client.id, NOW))!.access[0]).toMatchObject({ progress: { done: 1, total: 4 }, nextLocked: { id: l4.id, title: { et: "Neli" } } });
});

test("a lesson that is done is left as it was (ok, no new mark)", async () => {
  expect(await unlock({ lessonId: w.l1.id })).toEqual({ ok: true });
  const [p] = await rows(w.l1.id);
  expect([p.unlockedBy, p.doneAt, p.watchedSec]).toEqual([null, NOW, 100]);
});

test("the banner name: her own name, else her latest registration's, else her e-mail (a blank name is none)", async () => {
  const [bare] = await db.insert(clients).values({ email: "bare@example.test" }).returning();
  expect(await clientViewInfo(db, bare.id)).toEqual({ label: "bare@example.test", locale: "et" });
  const [blank] = await db.insert(clients).values({ email: "blank@example.test", name: "   " }).returning();
  expect(await clientViewInfo(db, blank.id)).toEqual({ label: "blank@example.test", locale: "et" });
  const reg = { courseId: w.contact.id, kind: "group" as const, paymentChoice: "half" as const, clientId: bare.id };
  await db.insert(registrations).values({ ...reg, name: "Liis Vana", email: "bare@example.test", createdAt: new Date("2026-09-01T10:00:00Z") });
  await db.insert(registrations).values({ ...reg, name: "Liis Tamm", email: "bare@example.test", createdAt: new Date("2026-09-20T10:00:00Z") });
  expect(await clientViewInfo(db, bare.id)).toEqual({ label: "Liis Tamm", locale: "et" });
  expect(await clientViewInfo(db, w.client.id)).toEqual({ label: "Kati", locale: "ru" }); // her own name wins
});
