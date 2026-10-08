"use client";

import Link from "next/link";
import { useId } from "react";
import { Icon } from "@/components/site/Icon";
import ui from "@/components/site/ui.module.css";
import type { EcourseCard, EcourseProgress } from "@/domain/account-cards";
import { pick } from "@/i18n/field";
import { fill } from "@/i18n/format";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { ProgressBar } from "./ProgressBar";
import type { CoursesTexts } from "./texts";
import styles from "./ResumeCard.module.css";

/** An e-course's progress that has a next lesson. */
export type ResumeProgress = EcourseProgress & { next: NonNullable<EcourseProgress["next"]> };

/**
 * The dark "Pooleli" card at the top of "Minu koolitused" (phase 2c, spec 4): the e-course she was busy with last (the dashboard's
 * `resume`), the next lesson as "{module} · {lesson}", the e-course page's bar with "{done} / {total} õppetundi tehtud", and the one
 * primary button, "Jätka" ("Alusta" before the first lesson is done, as on the e-course page), to that lesson. `readOnly` (the
 * admin's view): the button is there but does nothing.
 */
export function ResumeCard({ card, progress, locale, t, readOnly }: { card: EcourseCard; progress: ResumeProgress; locale: Locale; t: CoursesTexts; readOnly: boolean }) {
  const titleId = useId();
  const countId = useId();
  const { done, total, next } = progress;
  const label = (
    <>
      {done === 0 ? t.resumeBegin : t.resumeContinue}
      <Icon name="arrow" />
    </>
  );
  return (
    <article className={styles.card} aria-labelledby={titleId} data-resume-card={card.course.slug}>
      <span className={styles.tag}>{t.resumeTag}</span>
      <h2 id={titleId} className={styles.title}>
        {pick(card.course.title, locale)}
      </h2>
      <p className={styles.where} data-resume-where="">
        {fill(t.resumeWhere, { module: pick(next.moduleTitle, locale), lesson: pick(next.title, locale) })}
      </p>
      <p id={countId} className={styles.count} data-resume-progress="">
        {fill(t.resumeProgress, { done, total })}
      </p>
      <ProgressBar done={done} total={total} labelledBy={countId} tone="dark" />
      {readOnly ? (
        <a className={`${ui.btn} ${styles.action}`} role="link" aria-disabled="true" data-resume-next="">
          {label}
        </a>
      ) : (
        <Link className={`${ui.btn} ${styles.action}`} href={href(locale, `/konto/kursus/${card.course.slug}/${next.lessonId}`)} data-resume-next="">
          {label}
        </Link>
      )}
    </article>
  );
}
