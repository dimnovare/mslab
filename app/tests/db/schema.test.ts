import { expect, test } from "vitest";
import { makeTestDb } from "./helpers";
import { courses, courseImages, courseSessions, registrations } from "@/db/schema";

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
