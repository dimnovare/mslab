import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "./helpers";
import { courses, courseImages, courseSessions, registrations, requests, clients, clientSessions, courseAccess, mailQuota, courseModules, lessons, lessonFiles, lessonProgress } from "@/db/schema";

test("migrations apply and a course round-trips", async () => {
  const db = await makeTestDb();
  await db.insert(courses).values({ slug: "x", type: "contact", level: "basic", title: { et: "X" }, summary: { et: "" }, body: { et: "" } });
  const rows = await db.select().from(courses);
  expect(rows[0].title.et).toBe("X");
  expect(rows[0].published).toBe(false);
});

test("relations load course images, sessions and registration parents", async () => {
  const db = await makeTestDb();
  const [course] = await db.insert(courses).values({ slug: "rel", type: "contact", level: "basic", title: { et: "R" }, summary: { et: "" }, body: { et: "" } }).returning();
  await db.insert(courseImages).values({ courseId: course.id, key: "/seed/a.jpg" });
  const [session] = await db.insert(courseSessions).values({ courseId: course.id, startsAt: new Date("2026-11-01T09:00:00Z"), city: "Tallinn" }).returning();
  await db.insert(registrations).values({ courseId: course.id, courseSessionId: session.id, kind: "group", name: "A", email: "a@example.com", paymentChoice: "full" });

  const withChildren = await db.query.courses.findMany({ with: { images: true, sessions: true } });
  expect(withChildren[0].images).toHaveLength(1);
  expect(withChildren[0].sessions[0].capacity).toBe(4);

  const reg = await db.query.registrations.findFirst({ with: { course: true, courseSession: true } });
  expect(reg?.course.slug).toBe("rel");
  expect(reg?.courseSession?.city).toBe("Tallinn");
  expect(reg?.status).toBe("awaiting_prepayment");
});

test("client tables exist and link records", async () => {
  const db = await makeTestDb();
  const [c] = await db.insert(clients).values({ email: "kati@example.test" }).returning();
  await db.insert(clientSessions).values({ idHash: "h1", clientId: c.id, expiresAt: new Date(Date.now() + 1000) });
  await db.insert(mailQuota).values({ day: "2026-10-02", sent: 1 });
  const [course] = await db.insert(courses).values({ slug: "acc", type: "e_learning", level: "basic", title: { et: "A" }, summary: { et: "" }, body: { et: "" } }).returning(); // makeTestDb() does not seed
  await db.insert(courseAccess).values({ clientId: c.id, courseId: course.id, grantedBy: "admin@example.test", expiresAt: new Date() });
  await db.insert(requests).values({ kind: "change_request", payload: { registrationId: 1 }, clientId: c.id });
  const [r] = await db.select({ clientId: registrations.clientId }).from(registrations).limit(1);
  expect(r === undefined || r.clientId === null).toBe(true);
  await db.delete(clients).where(eq(clients.id, c.id)); // cascades sessions/access, nulls requests.client_id
  expect(await db.select().from(clientSessions)).toHaveLength(0);
  expect(await db.select().from(courseAccess)).toHaveLength(0);
  expect((await db.select().from(requests).where(eq(requests.kind, "change_request")))[0].clientId).toBeNull();
});

test("lesson tables: modules, lessons, files and progress, with their defaults, one progress row per student and lesson, cascading with the course", async () => {
  const db = await makeTestDb();
  const [course] = await db.insert(courses).values({ slug: "lt", type: "e_learning", level: "basic", title: { et: "L" }, summary: { et: "" }, body: { et: "" } }).returning();
  const [mod] = await db.insert(courseModules).values({ courseId: course.id, position: 1, title: { et: "M" } }).returning();
  const [lesson] = await db.insert(lessons).values({ moduleId: mod.id, position: 1, title: { et: "Õ" } }).returning();
  expect([lesson.kind, lesson.hidden, lesson.videoStatus, lesson.videoId, lesson.durationSec, lesson.body, lesson.replacedVideoId, lesson.videoStartedAt]).toEqual(["video", false, "none", null, null, null, null, null]);
  const [text] = await db.insert(lessons).values({ moduleId: mod.id, position: 2, title: { et: "T" }, kind: "text" }).returning();
  expect(text.kind).toBe("text");
  await db.insert(lessonFiles).values({ lessonId: lesson.id, position: 1, name: "a.pdf", r2Key: "lessons/x.pdf", size: 10, contentType: "application/pdf" });
  const [c] = await db.insert(clients).values({ email: "lt@example.test" }).returning();
  const [p] = await db.insert(lessonProgress).values({ clientId: c.id, lessonId: lesson.id }).returning();
  expect([p.watchedSec, p.doneAt, p.unlockedBy]).toEqual([0, null, null]);
  await expect(db.insert(lessonProgress).values({ clientId: c.id, lessonId: lesson.id })).rejects.toThrow();
  await db.delete(courses).where(eq(courses.id, course.id));
  for (const table of [courseModules, lessons, lessonFiles, lessonProgress]) expect(await db.select().from(table)).toHaveLength(0);
});
