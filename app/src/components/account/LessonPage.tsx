"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/site/Icon";
import { Notice } from "@/components/site/Notice";
import ui from "@/components/site/ui.module.css";
import { paragraphs } from "@/domain/catalogue";
import { videoAspect } from "@/domain/lessons";
import { fill, formatSize } from "@/i18n/format";
import { pick } from "@/i18n/field";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import type { LessonView } from "@/server/lesson-data";
import { AccountLoader } from "./AccountLoader";
import { GreetingSkeleton } from "./CardSkeleton";
import { LessonPlayer } from "./LessonPlayer";
import type { LessonTexts } from "./texts";
import page from "./EcoursePage.module.css";
import styles from "./LessonPage.module.css";

type Props = { slug: string; lessonId: number; locale: Locale; t: LessonTexts };

/** The waiting look of the page (the e-course page's): the title's and a line's stand-ins. */
const Waiting = () => (
  <div className={`${ui.wrap} ${page.wait}`}>
    <GreetingSkeleton />
  </div>
);

/**
 * The personal part of /konto/kursus/<slug>/<lesson> (the page itself is a static shell, the same for every visitor): loads
 * GET /api/konto/kursus/<slug>/<lesson> in the browser once (AccountLoader: skeleton, signed out → login page, another device, error
 * + retry), then
 * - the lesson (LessonBody);
 * - 403 locked: "Avaneb, kui eelmine õppetund on tehtud." with "Jätka" to the lesson that is open (or "Tagasi koolitusele" when none is);
 * - 403 terms (not accepted yet): straight to the course page, where the terms notice is;
 * - 404 (no access, no such lesson): "Seda õppetundi ei leitud." with "Tagasi koolitusele".
 * The lesson is never loaded again while the page is open (not on focus, not on a timer): a new answer signs the video's URL again,
 * which would reload the video under the student. What changes (done, the next lesson) comes from the player's and "Märgi tehtuks"'s
 * answers.
 */
export function LessonPage({ slug, lessonId, locale, t }: Props) {
  const course = href(locale, `/konto/kursus/${slug}`);
  const backButton = (
    <Link className={ui.btn} href={course}>
      {t.back}
      <Icon name="arrow" />
    </Link>
  );
  return (
    <AccountLoader<LessonView>
      path={`/api/konto/kursus/${encodeURIComponent(slug)}/${lessonId}`}
      locale={locale}
      t={t.loader}
      skeleton={<Waiting />}
      notFound={
        <div data-account-state="notFound">
          <Notice title={t.notFound}>{backButton}</Notice>
        </div>
      }
      forbidden={(r) =>
        r.error === "terms" ? (
          <GoToCourse to={course} />
        ) : (
          <div data-account-state="locked">
            <Notice title={t.lockedHint}>
              {r.next !== null ? (
                <Link className={ui.btn} href={href(locale, `/konto/kursus/${slug}/${r.next}`)}>
                  {t.resume}
                  <Icon name="arrow" />
                </Link>
              ) : (
                backButton
              )}
            </Notice>
          </div>
        )
      }
      render={(view) => <LessonBody key={view.lesson.id} view={view} slug={slug} locale={locale} t={t} />}
    />
  );
}

/** The course's terms are not accepted yet: the course page shows the notice, so the student goes there (the waiting look meanwhile). */
function GoToCourse({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <div aria-busy="true" data-account-state="terms">
      <Waiting />
    </div>
  );
}

/**
 * One open lesson, top to bottom: the module's title as the eyebrow and the lesson's title; the video (LessonPlayer) or "Video
 * lisandub peagi" (a video lesson whose video is not ready), nothing for a text lesson; the short text; the files ("Lae alla"); then
 * "Õppetund tehtud ✓" once done, the one button, and the quiet "Tagasi koolitusele".
 * The one button is the first that applies: "Märgi tehtuks" for a text lesson not done yet; nothing for a video lesson not done whose
 * video is not ready (nothing can complete it yet); else "Järgmine õppetund" when there is a next lesson — a link once this one is
 * done, before that a button that does nothing yet (aria-disabled).
 */
function LessonBody({ view, slug, locale, t }: { view: LessonView; slug: string; locale: Locale; t: LessonTexts }) {
  const [done, setDone] = useState(view.lesson.done);
  const [next, setNext] = useState(view.next);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /** "Märgi tehtuks" pressed: its answer moves the focus to the done line (rendered by then). */
  const marked = useRef(false);
  const doneLine = useRef<HTMLParagraphElement>(null);
  const busy = useRef(false);
  const { lesson, video } = view;
  const api = `/api/konto/kursus/${encodeURIComponent(slug)}/${lesson.id}`;
  const title = pick(lesson.title, locale);
  const body = paragraphs(pick(lesson.body, locale));

  useEffect(() => {
    if (done && marked.current) {
      marked.current = false;
      doneLine.current?.focus();
    }
  }, [done]);

  const markDone = async () => {
    if (busy.current) return; // a second press while it runs sends nothing
    busy.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch(`${api}/tehtud`, { method: "POST", credentials: "same-origin", headers: { accept: "application/json" } });
      const answer = res.ok ? ((await res.json().catch(() => null)) as { ok?: unknown; next?: unknown } | null) : null;
      if (answer?.ok !== true) throw new Error("not saved");
      marked.current = true;
      setDone(true);
      setNext((n) => (typeof answer.next === "number" ? answer.next : n));
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  let button: React.ReactNode = null;
  if (lesson.textOnly && !done)
    button = (
      <button type="button" className={ui.btn} onClick={markDone} aria-disabled={saving || undefined} data-mark-done="">
        {saving ? t.saving : t.markDone}
      </button>
    );
  else if (!lesson.textOnly && !done && video?.state !== "ready") button = null; // the video is not there yet: nothing completes the lesson
  else if (next !== null)
    button = done ? (
      <Link className={ui.btn} href={href(locale, `/konto/kursus/${slug}/${next}`)} data-lesson-next="">
        {t.next}
        <Icon name="arrow" />
      </Link>
    ) : (
      <span className={`${ui.btn} ${styles.notYet}`} aria-disabled="true" data-lesson-next="">
        {t.next}
      </span>
    );

  return (
    <div className={`${ui.wrap} ${page.page}`} data-lesson-page={lesson.id}>
      <p className={`${ui.eyebrow} ${styles.module}`} data-lesson-module="">
        {pick(view.module.title, locale)}
      </p>
      <h1 className={`${page.title} ${styles.title}`}>{title}</h1>

      {video?.state === "ready" && (
        <div className={styles.video} style={{ "--aspect": String(videoAspect(video.shape)) } as CSSProperties}>
          <LessonPlayer
            key={lesson.id}
            slug={slug}
            lessonId={lesson.id}
            title={title}
            video={video}
            watermark={view.watermark}
            done={done}
            t={t}
            onProgress={(a) => {
              if (a.done) setDone(true);
              setNext((n) => a.next ?? n);
            }}
          />
        </div>
      )}
      {video?.state === "soon" && (
        <p className={styles.soon} data-lesson-soon="">
          {t.soon}
        </p>
      )}

      {body.length > 0 && (
        <div className={styles.text} data-lesson-text="">
          {body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {view.files.length > 0 && (
        <section className={styles.files} data-lesson-files="">
          <h2 className={styles.filesTitle}>{t.files}</h2>
          <ul className={styles.fileList}>
            {view.files.map((f) => (
              <li key={f.id} className={styles.file}>
                <span className={styles.fileName}>
                  <span>{f.name}</span> <span className={styles.size}>{formatSize(f.size, locale)}</span>
                </span>
                <a className={ui.btnOutline} href={`${api}/fail/${f.id}`} aria-label={fill(t.downloadFile, { name: f.name })} data-lesson-file={f.id}>
                  {t.download}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.actions} data-lesson-actions="">
        {done && (
          <p ref={doneLine} className={styles.done} role="status" tabIndex={-1} data-lesson-done="">
            {t.done}
          </p>
        )}
        {button}
        {/* in the page from the start for a text lesson, empty: a screen reader announces the sentence when it comes */}
        {lesson.textOnly && (
          <p className={styles.failed} role="alert">
            {failed ? t.failed : ""}
          </p>
        )}
      </div>
      <p className={styles.back}>
        <Link className={ui.link} href={href(locale, `/konto/kursus/${slug}`)} data-lesson-back="">
          {t.back}
        </Link>
      </p>
    </div>
  );
}
