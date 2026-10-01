import type { Metadata } from "next";
import Link from "next/link";
import { CourseEditor, type OtherCourse } from "@/components/admin/CourseEditor";
import { adminTitle } from "@/components/admin/sections";
import { Shell } from "@/components/admin/Shell";
import ui from "@/components/admin/ui.module.css";
import { getDb } from "@/db/client";
import { getCourseForEdit, listAllCourses } from "@/db/queries/admin";
import { getCourseBySlug } from "@/db/queries/public";
import { draftFromCourse, newCourseDraft } from "@/domain/course-editor";
import { adminEt } from "@/i18n/dict/admin";
import { pick } from "@/i18n/field";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** "uus" → a new course; a number → that course; anything else → not found. */
function parseId(raw: string): number | "new" | null {
  if (raw === "uus") return "new";
  const n = Number(raw);
  return /^\d{1,10}$/.test(raw) && Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const id = parseId((await params).id);
  return { title: adminTitle(id === "new" ? adminEt.courseEditor.newTitle : adminEt.courseEditor.editCrumb) };
}

/** The course editor: /admin/koolitused/uus (new) and /admin/koolitused/<id>. */
export default async function CourseEditPage({ params, searchParams }: Props) {
  const email = await requireAdmin();
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  const id = parseId(raw);
  const db = getDb();
  const [course, all] = await Promise.all([typeof id === "number" ? getCourseForEdit(db, id) : null, listAllCourses(db)]);
  const t = adminEt.courseEditor;

  if (id === null || (id !== "new" && !course)) {
    return (
      <Shell email={email} active="courses">
        <div className={ui.page}>
          <div className={ui.heading}>
            <h1 className={ui.h1}>{adminEt.nav.courses}</h1>
          </div>
          <section className={ui.card}>
            <p className={ui.empty}>{t.notFound}</p>
            <Link className={ui.link} href="/admin/koolitused">
              {t.back}
            </Link>
          </section>
        </div>
      </Shell>
    );
  }

  // the card preview's meta line: the next scheduled session of a contact course
  const detail = course && course.type === "contact" ? await getCourseBySlug(db, course.slug, { includeUnpublished: true, sessionsFrom: new Date() }) : null;
  const next = detail?.sessions.find((s) => s.status === "scheduled");
  const others: OtherCourse[] = all
    .filter((c) => c.id !== course?.id)
    .map((c) => ({ id: c.id, title: pick(c.title, "et"), type: c.type, published: c.published }));

  return (
    <Shell email={email} active="courses">
      <CourseEditor
        initial={course ? draftFromCourse(course) : newCourseDraft()}
        others={others}
        next={next ? { startsAt: next.startsAt.toISOString(), city: next.city } : null}
        publicHref={course?.published ? `/koolitused/${course.slug}` : null}
        created={sp.loodud === "1"}
      />
    </Shell>
  );
}
