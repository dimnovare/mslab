"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { fill } from "@/i18n/format";
import { addStudent, grantCourseAccess, revokeCourseAccess } from "@/server/actions/admin-clients";
import type { ClientResult } from "@/server/admin-clients";
import ui from "./ui.module.css";
import ed from "./editor.module.css";
import forms from "./RegistrationForms.module.css";
import styles from "./ClientDrawer.module.css";

// The Õpilased forms: "Lisa õpilane" on the list, "Ava ligipääs" and "Lõpeta ligipääs" in a student's drawer. Submitted
// through startTransition (React does not reset the fields after an error); while one is on its way its button is
// aria-disabled (a disabled button would drop the keyboard focus) and a second press does nothing.

type Action = (fd: FormData) => void;
const submitWith = (action: Action, pending: boolean) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (pending) return;
  const fd = new FormData(e.currentTarget);
  startTransition(() => action(fd));
};

export type AddStudentTexts = { label: string; button: string; hint: string; invalid: string; saving: string; error: string };

/** "Lisa õpilane": an e-mail and one button. The server opens the student's drawer (new or existing). */
export function AddStudentForm({ t }: { t: AddStudentTexts }) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState<ClientResult | null, FormData>(addStudent, null);
  const error = state && !state.ok ? (state.error === "email" ? t.invalid : t.error) : null;
  return (
    <form className={styles.add} onSubmit={submitWith(action, pending)} noValidate data-add-student="">
      <div className={ui.field}>
        <label htmlFor={`${uid}-email`}>{t.label}</label>
        <div className={forms.inline}>
          <input
            id={`${uid}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            maxLength={254}
            className={`${ui.input} ${styles.addInput}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={state && !state.ok && state.error === "email" ? true : undefined}
            aria-describedby={`${uid}-hint ${uid}-msg`}
          />
          <button type="submit" className={`${ui.btn} ${ui.smallBtn}`} aria-disabled={pending || undefined}>
            {pending ? t.saving : t.button}
          </button>
        </div>
        <p id={`${uid}-hint`} className={ui.hint}>
          {t.hint}
        </p>
        <p id={`${uid}-msg`} role="status" className={ui.error}>
          {error ?? ""}
        </p>
      </div>
    </form>
  );
}

export type GrantTexts = {
  title: string;
  course: string;
  until: string;
  untilHint: string;
  button: string;
  done: string;
  courseError: string;
  date: string;
  notFound: string;
  saving: string;
  error: string;
};
export type GrantCourse = { id: number; label: string; until: string };

/**
 * "Ava ligipääs": the e-course (drafts marked) and the last day, filled in with today + the course's access months (a
 * new course choice fills in its own); one button. Granting a course the student had before opens it again until the new day.
 */
export function GrantAccessForm({ clientId, courses, initialCourseId, today, t }: { clientId: number; courses: GrantCourse[]; initialCourseId: number; today: string; t: GrantTexts }) {
  const uid = useId();
  const [courseId, setCourseId] = useState(initialCourseId);
  const [until, setUntil] = useState(() => courses.find((c) => c.id === initialCourseId)?.until ?? "");
  const [state, action, pending] = useActionState<ClientResult | null, FormData>(grantCourseAccess, null);
  // the last answer is about what was sent: a changed course or day is not "opened" (nor refused) yet
  const [edited, setEdited] = useState(false);
  const answer = edited ? null : state;
  const error = answer && !answer.ok ? (answer.error === "date" ? t.date : answer.error === "course" ? t.courseError : answer.error === "notFound" ? t.notFound : t.error) : null;
  const message = pending ? t.saving : (error ?? (answer?.ok ? t.done : ""));
  return (
    <form
      className={`${forms.form} ${styles.grant}`}
      onSubmit={(e) => {
        setEdited(false);
        submitWith(action, pending)(e);
      }}
      noValidate
      data-grant-form=""
    >
      <h4 className={styles.formTitle}>{t.title}</h4>
      <input type="hidden" name="clientId" value={clientId} />
      <div className={ui.field}>
        <label htmlFor={`${uid}-course`}>{t.course}</label>
        <select
          id={`${uid}-course`}
          name="courseId"
          className={`${ui.input} ${ed.select}`}
          value={courseId}
          onChange={(e) => {
            const next = Number(e.target.value);
            setCourseId(next);
            setUntil(courses.find((c) => c.id === next)?.until ?? until);
            setEdited(true);
          }}
          aria-invalid={answer && !answer.ok && answer.error === "course" ? true : undefined}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className={ui.field}>
        <label htmlFor={`${uid}-until`}>{t.until}</label>
        <input
          id={`${uid}-until`}
          name="until"
          type="date"
          min={today}
          className={`${ui.input} ${ed.dateTime} ${styles.date}`}
          value={until}
          onChange={(e) => {
            setUntil(e.target.value);
            setEdited(true);
          }}
          aria-invalid={answer && !answer.ok && answer.error === "date" ? true : undefined}
          aria-describedby={`${uid}-hint`}
        />
        <p id={`${uid}-hint`} className={ui.hint}>
          {t.untilHint}
        </p>
      </div>
      <div className={forms.actions}>
        <button type="submit" className={`${ui.btn} ${ui.smallBtn}`} aria-disabled={pending || undefined}>
          {pending ? t.saving : t.button}
        </button>
      </div>
      <p role="status" className={error ? ui.error : ui.success} data-grant-status="">
        {message}
      </p>
    </form>
  );
}

export type RevokeTexts = { button: string; confirm: string; yes: string; no: string; saving: string; error: string };

/**
 * "Lõpeta ligipääs" of one open access, with one confirming step in place ("Jah, lõpeta" / "Ei"). Rendered for every
 * access row (`active` false: nothing shown), so that once the access has ended the focus can go to the row's new state
 * line (`stateId`) instead of being lost with the button.
 */
export function RevokeAccess({ clientId, accessId, course, active, stateId, t }: { clientId: number; accessId: number; course: string; active: boolean; stateId: string; t: RevokeTexts }) {
  const uid = useId();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ClientResult | null, FormData>(revokeCourseAccess, null);
  const question = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // Ended here (the page came back with the access ended): the button and its step are gone, and the focus goes to the
  // line that now says so. Adjusted while rendering, as RegistrationForms follows its saved values.
  const [seenActive, setSeenActive] = useState(active);
  const [focusState, setFocusState] = useState(false);
  if (seenActive !== active) {
    setSeenActive(active);
    setConfirming(false);
    setFocusState(!active && state?.ok === true);
  }

  useEffect(() => {
    if (confirming) question.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (focusState) document.getElementById(stateId)?.focus();
  }, [focusState, stateId]);

  if (!active) return null;
  if (!confirming)
    return (
      <button ref={opener} type="button" className={`${ui.btn} ${ui.danger} ${ui.smallBtn}`} onClick={() => setConfirming(true)} data-revoke="">
        {t.button}
      </button>
    );
  return (
    <form className={styles.confirm} role="group" aria-labelledby={`${uid}-q`} onSubmit={submitWith(action, pending)} data-revoke-confirm="">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="accessId" value={accessId} />
      <p id={`${uid}-q`} ref={question} tabIndex={-1} className={`${ui.notice} ${styles.question}`}>
        {fill(t.confirm, { course })}
      </p>
      <div className={forms.actions}>
        <button type="submit" className={`${ui.btn} ${ui.danger} ${ui.smallBtn}`} aria-disabled={pending || undefined}>
          {pending ? t.saving : t.yes}
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`}
          onClick={() => {
            setConfirming(false);
            requestAnimationFrame(() => opener.current?.focus());
          }}
        >
          {t.no}
        </button>
      </div>
      {state && !state.ok && (
        <p role="alert" className={ui.error}>
          {t.error}
        </p>
      )}
    </form>
  );
}
