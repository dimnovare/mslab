"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { adminEt } from "@/i18n/dict/admin";
import type { I18n } from "@/i18n/field";
import { fill } from "@/i18n/format";
import { deleteLesson, saveLesson, setLessonHidden, setLessonKind } from "@/server/actions/admin-lessons";
import type { AdminLesson } from "@/server/admin-lessons";
import type { EditResult } from "@/server/edit-check";
import { Choice } from "./Choice";
import { I18nInput } from "./I18nInput";
import { LessonFiles } from "./LessonFiles";
import { lessonError } from "./LessonsEditor";
import ui from "./ui.module.css";
import ed from "./editor.module.css";
import forms from "./RegistrationForms.module.css";
import cd from "./ClientDrawer.module.css";
import styles from "./LessonsEditor.module.css";

// One lesson in the admin drawer (?oppetund=<id> on the course editor's address), top to bottom: its name and short text
// ("Salvesta"), "Õppetunni liik" (Video / Tekst), its files, "Peida" / "Näita õpilastele" and "Kustuta õppetund". Each part is
// saved on its own (server/actions/admin-lessons.ts); the page then comes back with the stored lesson. Task 6 adds the video
// field after "Õppetunni liik", for a video lesson only.

const t = adminEt.lessons;

type Action = (fd: FormData) => void;
const send = (action: Action, fields: Record<string, string | number>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  startTransition(() => action(fd));
};

const textOf = (lesson: AdminLesson) => ({ title: lesson.title, body: lesson.body ?? { et: "" } });
type LessonKind = AdminLesson["kind"];
const sameText = (a: { title: I18n; body: I18n }, b: { title: I18n; body: I18n }) =>
  a.title.et === b.title.et && (a.title.ru ?? "") === (b.title.ru ?? "") && a.body.et === b.body.et && (a.body.ru ?? "") === (b.body.ru ?? "");

type Props = {
  courseId: number;
  lesson: AdminLesson;
  /** Bunny is set up (the video field, Task 6): until then unused. */
  bunnyReady: boolean;
};

export function LessonDrawer({ courseId, lesson }: Props) {
  return (
    <div className={cd.detail} data-lesson-drawer={lesson.id}>
      <div className={cd.head}>
        <h2 className={ui.h2}>
          {lesson.title.et}
        </h2>
      </div>
      <LessonText lesson={lesson} />
      <LessonKindField lesson={lesson} />
      <LessonFiles lessonId={lesson.id} files={lesson.files} />
      <LessonVisibility lesson={lesson} />
      <LessonDelete courseId={courseId} lesson={lesson} />
    </div>
  );
}

/** The name and the short text (ET / RU), "Salvesta", and a line that says it is saved or what is wrong. */
function LessonText({ lesson }: { lesson: AdminLesson }) {
  const uid = useId();
  const [draft, setDraft] = useState(() => textOf(lesson));
  const [stored, setStored] = useState(() => textOf(lesson));
  // the stored lesson changed (this save, reloaded by the server): the fields follow it
  if (!sameText(stored, textOf(lesson))) {
    setStored(textOf(lesson));
    setDraft(textOf(lesson));
  }
  const [state, action, pending] = useActionState<EditResult | null, FormData>(saveLesson, null);
  const form = useRef<HTMLFormElement>(null);
  // a refused save: the first marked field gets the focus
  useEffect(() => {
    if (state && !state.ok && state.fields) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  const dirty = !sameText(draft, textOf(lesson));
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  const fieldText = (name: "title" | "body") => (fields[name] ? (fields[name] === "tooLong" ? t.errors.tooLong : t.errors.required) : undefined);
  const error = state && !state.ok ? (state.fields ? null : lessonError(state)) : null;
  const message = pending ? adminEt.common.saving : (error ?? (state?.ok && !dirty ? t.drawer.saved : ""));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    send(action, { id: lesson.id, titleEt: draft.title.et, titleRu: draft.title.ru ?? "", bodyEt: draft.body.et, bodyRu: draft.body.ru ?? "" });
  };

  return (
    <form ref={form} className={cd.section} onSubmit={submit} noValidate data-lesson-text="">
      <I18nInput label={t.drawer.name} name="lesson-title" value={draft.title} onChange={(title) => setDraft((d) => ({ ...d, title }))} maxLength={120} error={fieldText("title")} />
      <I18nInput
        label={t.drawer.body}
        hint={t.drawer.bodyHint}
        name="lesson-body"
        value={draft.body}
        onChange={(body) => setDraft((d) => ({ ...d, body }))}
        multiline
        rows={6}
        maxLength={5000}
        error={fieldText("body")}
      />
      <div className={styles.saveRow}>
        <button type="submit" className={`${ui.btn} ${ui.smallBtn}`} aria-disabled={pending || undefined} data-save-lesson="">
          {pending ? adminEt.common.saving : t.save}
        </button>
        <p id={`${uid}-msg`} role="status" className={pending ? ui.hint : error ? ui.error : ui.success} data-lesson-status="">
          {message}
        </p>
      </div>
    </form>
  );
}

/**
 * "Õppetunni liik": Video or Tekst, saved as soon as it is chosen. Tekst on a lesson that has a video (or one on its way) asks
 * first, in place ("Video kustutatakse. Jätkan?"): "Ei" puts the choice back on Video.
 */
function LessonKindField({ lesson }: { lesson: AdminLesson }) {
  const uid = useId();
  const [choice, setChoice] = useState<LessonKind>(lesson.kind);
  const [stored, setStored] = useState<LessonKind>(lesson.kind);
  const [confirming, setConfirming] = useState(false);
  if (stored !== lesson.kind) {
    setStored(lesson.kind);
    setChoice(lesson.kind);
    setConfirming(false);
  }
  const [state, action, pending] = useActionState<EditResult | null, FormData>(setLessonKind, null);
  const question = useRef<HTMLParagraphElement>(null);
  const hasVideo = lesson.videoStatus !== "none" || lesson.replacing;
  const error = lessonError(state);

  useEffect(() => {
    if (confirming) question.current?.focus();
  }, [confirming]);

  const choose = (kind: LessonKind) => {
    if (pending) return;
    setChoice(kind);
    // back on the stored kind (Video while "Video kustutatakse" is asked): nothing to save
    if (kind === lesson.kind) return setConfirming(false);
    if (kind === "text" && hasVideo) return setConfirming(true);
    setConfirming(false);
    send(action, { id: lesson.id, kind });
  };
  const back = () => {
    setConfirming(false);
    setChoice("video");
    requestAnimationFrame(() => document.getElementById(`${uid}-video`)?.focus());
  };

  return (
    <section className={cd.section} data-lesson-kind="">
      <fieldset className={`${ed.fieldset} ${styles.kind}`} aria-describedby={error ? `${uid}-msg` : undefined} aria-busy={pending || undefined}>
        <legend className={ui.legend}>{t.drawer.kind.label}</legend>
        <div className={ed.choices}>
          {(["video", "text"] as const).map((k) => (
            <Choice
              key={k}
              id={`${uid}-${k}`}
              className={ed.choice}
              label={t.drawer.kind[k]}
              type="radio"
              name={`${uid}-kind`}
              value={k}
              checked={choice === k}
              onChange={() => choose(k)}
            />
          ))}
        </div>
      </fieldset>
      {confirming && (
        <form
          className={cd.confirm}
          role="group"
          aria-labelledby={`${uid}-q`}
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            setConfirming(false);
            send(action, { id: lesson.id, kind: "text" });
          }}
          data-kind-confirm=""
        >
          <p id={`${uid}-q`} ref={question} tabIndex={-1} className={`${ui.notice} ${cd.question}`}>
            {t.drawer.kind.confirm}
          </p>
          <div className={forms.actions}>
            <button type="submit" className={`${ui.btn} ${ui.danger} ${ui.smallBtn}`}>
              {t.drawer.kind.yes}
            </button>
            <button type="button" className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`} onClick={back}>
              {t.drawer.kind.no}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p id={`${uid}-msg`} role="alert" className={ui.error}>
          {error}
        </p>
      )}
    </section>
  );
}

/** "Peida" / "Näita õpilastele": one button; while hidden, a line says what that means. */
function LessonVisibility({ lesson }: { lesson: AdminLesson }) {
  const uid = useId();
  const [state, action, pending] = useActionState<EditResult | null, FormData>(setLessonHidden, null);
  const error = lessonError(state);
  return (
    <section className={cd.section} aria-labelledby={`${uid}-h`} data-lesson-visibility="">
      <h3 id={`${uid}-h`} className={ui.h3}>
        {t.drawer.visibility}
      </h3>
      {lesson.hidden && <p className={ui.notice}>{t.drawer.hiddenNote}</p>}
      <div className={forms.actions}>
        <button
          type="button"
          className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`}
          aria-disabled={pending || undefined}
          onClick={() => {
            if (!pending) send(action, { id: lesson.id, hidden: lesson.hidden ? "0" : "1" });
          }}
        >
          {pending ? adminEt.common.saving : lesson.hidden ? t.drawer.show : t.drawer.hide}
        </button>
      </div>
      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * "Kustuta õppetund" with one confirming step in place. A lesson a student has progress on is not deleted (only hidden): then only a
 * sentence says so. Deleted, the page goes back to the course and the drawer closes.
 */
function LessonDelete({ courseId, lesson }: { courseId: number; lesson: AdminLesson }) {
  const uid = useId();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<EditResult | null, FormData>(deleteLesson, null);
  const question = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const error = lessonError(state, t.drawer.inUse);

  useEffect(() => {
    if (confirming) question.current?.focus();
  }, [confirming]);

  return (
    <section className={cd.section} data-delete-lesson="">
      {lesson.inUse ? (
        <p className={`${ui.muted} ${ui.small}`}>{t.drawer.inUse}</p>
      ) : confirming ? (
        <form
          className={cd.confirm}
          role="group"
          aria-labelledby={`${uid}-q`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) send(action, { id: lesson.id, courseId });
          }}
          data-delete-lesson-confirm=""
        >
          <p id={`${uid}-q`} ref={question} tabIndex={-1} className={`${ui.notice} ${cd.question}`}>
            {fill(t.drawer.deleteConfirm, { title: lesson.title.et })}
          </p>
          <div className={forms.actions}>
            <button type="submit" className={`${ui.btn} ${ui.danger} ${ui.smallBtn}`} aria-disabled={pending || undefined}>
              {pending ? adminEt.common.saving : t.deleteYes}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`}
              onClick={() => {
                setConfirming(false);
                requestAnimationFrame(() => opener.current?.focus());
              }}
            >
              {t.deleteNo}
            </button>
          </div>
          {error && (
            <p role="alert" className={ui.error}>
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className={forms.actions}>
          <button ref={opener} type="button" className={`${ui.btn} ${ui.danger} ${ui.smallBtn}`} onClick={() => setConfirming(true)}>
            {t.drawer.delete}
          </button>
        </div>
      )}
    </section>
  );
}
