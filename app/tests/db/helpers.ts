import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { courseModules, type CourseModule } from "@/db/schema";
import type { I18n } from "@/i18n/field";

export async function makeTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

/** Module rows for a course (course_modules), positions 1…n in the given order. */
export async function addModules(db: Db, courseId: number, titles: I18n[]): Promise<CourseModule[]> {
  return titles.length ? db.insert(courseModules).values(titles.map((title, i) => ({ courseId, position: i + 1, title }))).returning() : [];
}
