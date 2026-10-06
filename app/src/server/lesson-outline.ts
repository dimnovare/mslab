import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { courseModules, lessonProgress, lessons } from "@/db/schema";
import { courseProgress, lessonStates, type CourseProgress, type LessonState, type OrderedLesson } from "@/domain/lessons";
import type { I18n } from "@/i18n/field";

// One student's view of a course's lessons: the modules in order (empty ones too), the visible lessons in course order with their
// state (domain/lessons.ts: done, current, locked), and the counts. Read by the e-course page (client-data.ts loadEcourse), the lesson
// endpoints (lesson-data.ts) and the admin's student drawer (admin-clients.ts). Two queries; no access check here (callers make it).

export type OutlineLesson = { id: number; moduleId: number; title: I18n; state: LessonState };
export type OutlineModule = { id: number; title: I18n; lessons: OutlineLesson[] };
export type CourseOutline = { modules: OutlineModule[]; lessons: OutlineLesson[]; progress: CourseProgress };

export async function courseOutline(db: Db, courseId: number, clientId: number): Promise<CourseOutline> {
  const [mods, rows] = await Promise.all([
    db.select({ id: courseModules.id, title: courseModules.title }).from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(asc(courseModules.position), asc(courseModules.id)),
    db
      .select({
        id: lessons.id,
        moduleId: lessons.moduleId,
        title: lessons.title,
        done: sql<boolean>`${lessonProgress.doneAt} is not null`,
        unlocked: sql<boolean>`${lessonProgress.unlockedBy} is not null`,
      })
      .from(lessons)
      .innerJoin(courseModules, eq(lessons.moduleId, courseModules.id))
      .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.clientId, clientId)))
      .where(and(eq(courseModules.courseId, courseId), eq(lessons.hidden, false)))
      .orderBy(asc(courseModules.position), asc(courseModules.id), asc(lessons.position), asc(lessons.id)),
  ]);
  const ordered: OrderedLesson[] = rows.map((r) => ({ id: r.id, done: Boolean(r.done), unlockedByAdmin: Boolean(r.unlocked) }));
  const states = lessonStates(ordered);
  const list: OutlineLesson[] = rows.map((r, i) => ({ id: r.id, moduleId: r.moduleId, title: r.title, state: states[i] }));
  return {
    modules: mods.map((m) => ({ id: m.id, title: m.title, lessons: list.filter((l) => l.moduleId === m.id) })),
    lessons: list,
    progress: courseProgress(ordered),
  };
}
