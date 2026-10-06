import { rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vitest";
import * as schema from "@/db/schema";
import { migrationsThrough } from "./helpers";

// Migration 0004 adds the lessons' video shape (video_width, video_height): two nullable integers, nothing else. Checked as the
// Railway database goes through it: 0000–0003 applied with a lesson that already has a ready video, then 0004. The lesson survives
// untouched with an unknown shape (null, null: the player assumes 16:9), and the migration is additive only (no column is dropped or
// changed, no NOT NULL or default is added, the rows are not rewritten).

type Column = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

test("0004 adds video_width and video_height (nullable integers, no default) to lessons and leaves every lesson as it was", async () => {
  const db = drizzle(new PGlite(), { schema });
  const migrateThrough = async (tag: string) => {
    const dir = migrationsThrough(tag);
    try {
      await migrate(db, { migrationsFolder: dir });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const columns = async () =>
    (
      (await db.execute(sql`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'lessons' order by ordinal_position`)) as unknown as {
        rows: Column[];
      }
    ).rows;

  await migrateThrough("0003_lessons");
  const before = await columns();
  expect(before.map((c) => c.column_name)).not.toContain("video_width");
  await db.execute(sql`
    insert into courses (slug, type, level, title, summary, body) values ('veeb', 'e_learning', 'basic', '{"et":"Veeb"}', '{"et":""}', '{"et":""}')`);
  await db.execute(sql`insert into course_modules (course_id, position, title) select id, 1, '{"et":"M"}' from courses`);
  await db.execute(sql`
    insert into lessons (module_id, position, title, kind, video_id, video_status, duration_sec)
    select id, 1, '{"et":"Esimene"}', 'video', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ready', 125 from course_modules`);
  const lessonRow = async () => ((await db.execute(sql`select id, position, kind, video_id, video_status, duration_sec, replaced_video_id from lessons`)) as unknown as { rows: unknown[] }).rows;
  const lessonBefore = await lessonRow();
  expect(lessonBefore).toHaveLength(1);

  await migrateThrough("0004_video_shape");

  const after = await columns();
  // additive only: every earlier column is as it was, in the same order, and the two new ones follow
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after.slice(before.length)).toEqual([
    { column_name: "video_width", data_type: "integer", is_nullable: "YES", column_default: null },
    { column_name: "video_height", data_type: "integer", is_nullable: "YES", column_default: null },
  ]);
  expect(await lessonRow()).toEqual(lessonBefore);
  const shape = (await db.execute(sql`select video_width, video_height from lessons`)) as unknown as { rows: { video_width: number | null; video_height: number | null }[] };
  expect(shape.rows).toEqual([{ video_width: null, video_height: null }]); // unknown: the player assumes 16:9

  // and the columns take a shape
  await db.execute(sql`update lessons set video_width = 1080, video_height = 1920`);
  expect(((await db.execute(sql`select video_width, video_height from lessons`)) as unknown as { rows: unknown[] }).rows).toEqual([{ video_width: 1080, video_height: 1920 }]);
});
