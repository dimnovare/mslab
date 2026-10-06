"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { formatDuration, moveLesson, type ModuleLayout } from "@/domain/lessons";
import { adminEt } from "@/i18n/dict/admin";
import type { I18n } from "@/i18n/field";
import { fill } from "@/i18n/format";
import { addLesson, addModule, deleteModule, moveLessonInList, moveModuleInList, renameModule } from "@/server/actions/admin-lessons";
import type { AdminLesson, AdminModule } from "@/server/admin-lessons";
import type { EditResult } from "@/server/edit-check";
import { I18nInput } from "./I18nInput";
import ui from "./ui.module.css";
import ed from "./editor.module.css";
import forms from "./RegistrationForms.module.css";
import cd from "./ClientDrawer.module.css";
import styles from "./LessonsEditor.module.css";

// "Moodulid ja õppetunnid" (an e-course) or "Programm" (a contact course: module titles only), under the course editor. Every
// change is saved at once by its own small form (server/actions/admin-lessons.ts); the page then comes back with the stored
// state. The course editor's "Salvesta" is not needed for any of it. A lesson opens in the drawer (?oppetund=<id>,
// LessonDrawer.tsx). Submitted through startTransition (React keeps the fields after an error); while one is on its way its
// button is aria-disabled (a disabled button would drop the keyboard focus) and a second press does nothing.

const t = adminEt.lessons;

type Action = (fd: FormData) => void;
/** Sends these fields through `action` (a server action of useActionState). */
const send = (action: Action, fields: Record<string, string | number>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  startTransition(() => action(fd));
};

/** The text of a refused change: the field codes of `invalid` (a name), else inUse, notFound, server. */
export function lessonError(r: EditResult | null, inUse: string = t.errors.inUse): string | null {
  if (!r || r.ok) return null;
  const field = r.fields?.title ?? r.fields?.body;
  if (r.error === "invalid" && field) return field === "tooLong" ? t.errors.tooLong : t.errors.required;
  if (r.error === "inUse") return inUse;
  if (r.error === "notFound") return t.errors.notFound;
  return t.errors.server;
}

const same = (a: I18n, b: I18n) => a.et === b.et && (a.ru ?? "") === (b.ru ?? "");

type Props = {
  /** The saved course; null on a new course (nothing can be added before it is saved). */
  courseId: number | null;
  /** An e-course: modules with lessons. A contact course: its programme (module titles only). */
  online: boolean;
  modules: AdminModule[];
};

export function LessonsEditor({ courseId, online, modules }: Props) {
  const uid = useId();
  const addField = useRef<HTMLInputElement>(null);
  // ↑ / ↓ and "Kustuta moodul" live here, not in the rows: a moved lesson can land in another module's list (a new row), a deleted
  // module's row is gone. The answer comes with the page's new state, so the effects below run once the rows are in place.
  const [moduleMove, moveModuleAction, moduleMoving] = useActionState<EditResult | null, FormData>(moveModuleInList, null);
  const [lessonMove, moveLessonAction, lessonMoving] = useActionState<EditResult | null, FormData>(moveLessonInList, null);
  const [moduleDelete, deleteModuleAction, deleting] = useActionState<EditResult | null, FormData>(deleteModule, null);
  /** The ↑ / ↓ last pressed (its id), so the focus stays on it where its row is now. */
  const moved = useRef<string | null>(null);
  /** Which module or lesson the last move or delete was for (its error goes under that row). */
  const [target, setTarget] = useState<{ moduleMove?: number; lessonMove?: number; moduleDelete?: number }>({});

  useEffect(() => {
    const id = moved.current;
    moved.current = null;
    if (id) document.getElementById(id)?.focus();
  }, [moduleMove, lessonMove]);

  // a module deleted: its row is gone, the focus goes to the field for a new one
  useEffect(() => {
    if (moduleDelete?.ok) addField.current?.focus();
  }, [moduleDelete]);

  const layout: ModuleLayout[] = modules.map((m) => ({ moduleId: m.id, lessonIds: m.lessons.map((l) => l.id) }));

  const moveModule = (m: AdminModule, i: number, dir: "up" | "down") => {
    if (moduleMoving || (dir === "up" ? i === 0 : i === modules.length - 1)) return;
    moved.current = `module-${m.id}-${dir}`;
    setTarget((x) => ({ ...x, moduleMove: m.id }));
    send(moveModuleAction, { id: m.id, dir });
  };
  const moveLessonTo = (l: AdminLesson, dir: "up" | "down") => {
    if (lessonMoving || !moveLesson(layout, l.id, dir === "up" ? -1 : 1)) return;
    moved.current = `lesson-${l.id}-${dir}`;
    setTarget((x) => ({ ...x, lessonMove: l.id }));
    send(moveLessonAction, { id: l.id, dir });
  };

  return (
    <section className={`${ui.card} ${styles.editor}`} aria-labelledby={`${uid}-title`} data-lessons-editor="">
      <div className={styles.intro}>
        <h2 id={`${uid}-title`} className={ui.h2}>
          {online ? t.title : adminEt.courseEditor.sections.modulesC}
        </h2>
        <p className={ui.hint}>{online ? t.hint : adminEt.courseEditor.fields.modulesCHint}</p>
      </div>

      {courseId === null ? (
        <p className={ui.notice}>{t.saveFirst}</p>
      ) : (
        <>
          {modules.length === 0 ? (
            <p className={`${ui.muted} ${ui.small}`}>{t.empty}</p>
          ) : (
            <ol className={styles.modules}>
              {modules.map((m, i) => (
                <ModuleRow
                  key={m.id}
                  module={m}
                  n={i + 1}
                  first={i === 0}
                  last={i === modules.length - 1}
                  online={online}
                  onMove={(dir) => moveModule(m, i, dir)}
                  moveError={target.moduleMove === m.id ? lessonError(moduleMove) : null}
                  deleteError={target.moduleDelete === m.id ? lessonError(moduleDelete) : null}
                  onDelete={() => {
                    if (deleting) return;
                    setTarget((x) => ({ ...x, moduleDelete: m.id }));
                    send(deleteModuleAction, { id: m.id });
                  }}
                  deleting={deleting}
                >
                  {online && (
                    <LessonList
                      module={m}
                      n={i + 1}
                      layout={layout}
                      courseId={courseId}
                      onMove={moveLessonTo}
                      moveError={(l) => (target.lessonMove === l.id ? lessonError(lessonMove) : null)}
                    />
                  )}
                </ModuleRow>
              ))}
            </ol>
          )}
          <AddModuleForm courseId={courseId} online={online} field={addField} />
        </>
      )}
    </section>
  );
}

type ModuleRowProps = {
  module: AdminModule;
  n: number;
  first: boolean;
  last: boolean;
  online: boolean;
  onMove: (dir: "up" | "down") => void;
  moveError: string | null;
  deleteError: string | null;
  onDelete: () => void;
  deleting: boolean;
  children: React.ReactNode;
};

/** One module: its number, its name (ET / RU) with "Salvesta" while changed, ↑ ↓, "Kustuta moodul" while it has no lessons. */
function ModuleRow({ module: m, n, first, last, online, onMove, moveError, deleteError, onDelete, deleting, children }: ModuleRowProps) {
  const uid = useId();
  const [title, setTitle] = useState<I18n>(m.title);
  const [stored, setStored] = useState<I18n>(m.title);
  // the stored name changed (this save, reloaded by the server): the field follows it
  if (!same(stored, m.title)) {
    setStored(m.title);
    setTitle(m.title);
  }
  const [state, action, pending] = useActionState<EditResult | null, FormData>(renameModule, null);
  const [confirming, setConfirming] = useState(false);
  const question = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const dirty = !same(title, m.title);
  const name = m.title.et;

  useEffect(() => {
    if (confirming) question.current?.focus();
  }, [confirming]);

  const rename = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending || !dirty) return;
    send(action, { id: m.id, titleEt: title.et, titleRu: title.ru ?? "" });
  };
  // a refused name goes under the field; anything else about this module under the row
  const fieldError = state && !state.ok && state.fields ? lessonError(state) : null;
  const error = (fieldError ? null : lessonError(state)) ?? moveError ?? deleteError;

  return (
    <li className={styles.module} data-module={m.id}>
      <div className={styles.moduleHead}>
        <span className={`${ed.num} ${styles.moduleNum}`} aria-hidden="true">
          {String(n).padStart(2, "0")}
        </span>
        <form className={styles.rename} onSubmit={rename} noValidate data-rename-module="">
          <I18nInput
            label={online ? t.moduleName : adminEt.courseEditor.fields.modulesC}
            name={`module-${m.id}`}
            value={title}
            onChange={setTitle}
            maxLength={120}
            error={fieldError ?? undefined}
          />
          {dirty && (
            <button type="submit" className={`${ui.btn} ${ui.secondary} ${ui.smallBtn} ${styles.save}`} aria-disabled={pending || undefined}>
              {pending ? adminEt.common.saving : t.save}
            </button>
          )}
        </form>
        <span className={`${ed.tools} ${styles.moduleTools}`}>
          <button id={`module-${m.id}-up`} type="button" className={ed.iconBtn} aria-label={fill(t.moveUp, { title: name })} aria-disabled={first || undefined} onClick={() => onMove("up")}>
            ↑
          </button>
          <button id={`module-${m.id}-down`} type="button" className={ed.iconBtn} aria-label={fill(t.moveDown, { title: name })} aria-disabled={last || undefined} onClick={() => onMove("down")}>
            ↓
          </button>
        </span>
      </div>

      {m.lessons.length === 0 &&
        (confirming ? (
          <form
            className={cd.confirm}
            role="group"
            aria-labelledby={`${uid}-q`}
            onSubmit={(e) => {
              e.preventDefault();
              onDelete();
            }}
            data-delete-module-confirm=""
          >
            <p id={`${uid}-q`} ref={question} tabIndex={-1} className={`${ui.notice} ${cd.question}`}>
              {fill(t.deleteModuleConfirm, { title: name })}
            </p>
            <div className={forms.actions}>
              <button type="submit" className={`${ui.btn} ${ui.danger} ${ui.smallBtn}`} aria-disabled={deleting || undefined}>
                {deleting ? adminEt.common.saving : t.deleteYes}
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
          </form>
        ) : (
          <div className={forms.actions}>
            <button ref={opener} type="button" className={`${ui.btn} ${ui.danger} ${ui.smallBtn}`} onClick={() => setConfirming(true)} data-delete-module="">
              {t.deleteModule}
            </button>
          </div>
        ))}

      {error && (
        <p role="alert" className={`${ui.error} ${styles.rowError}`} data-module-error="">
          {error}
        </p>
      )}

      {children}
    </li>
  );
}

/** An e-course module's lessons: number, name, tags, ↑ ↓ and "Muuda" (the drawer); then "Lisa õppetund". */
function LessonList({
  module: m,
  n,
  layout,
  courseId,
  onMove,
  moveError,
}: {
  module: AdminModule;
  n: number;
  layout: ModuleLayout[];
  courseId: number;
  onMove: (l: AdminLesson, dir: "up" | "down") => void;
  moveError: (l: AdminLesson) => string | null;
}) {
  return (
    <div className={styles.lessonPart}>
      {m.lessons.length === 0 ? (
        <p className={`${ui.muted} ${ui.small}`}>{t.noLessons}</p>
      ) : (
        <ol className={styles.lessons} data-lessons="">
          {m.lessons.map((l, i) => {
            const title = l.title.et;
            const error = moveError(l);
            return (
              <li key={l.id} className={styles.lesson} data-lesson={l.id}>
                <span className={styles.lessonNum} aria-hidden="true">
                  {n}.{i + 1}
                </span>
                <span className={styles.lessonTitle} data-lesson-title="">
                  {title}
                </span>
                <span className={styles.tags}>
                  {l.hidden && (
                    <span className={`${ui.tag} ${ui.muted}`} data-lesson-hidden="">
                      {t.hiddenTag}
                    </span>
                  )}
                  {l.kind === "text" ? (
                    <span className={ui.tag} data-lesson-kind="text">
                      {t.textTag}
                    </span>
                  ) : (
                    <span className={`${ui.tag} ${VIDEO_TONE[l.videoStatus]}`} data-lesson-video={l.videoStatus}>
                      {fill(t.videoTag[l.videoStatus], { duration: formatDuration(l.durationSec ?? 0) })}
                    </span>
                  )}
                </span>
                <span className={`${ed.tools} ${styles.lessonTools}`}>
                  <button
                    id={`lesson-${l.id}-up`}
                    type="button"
                    className={ed.iconBtn}
                    aria-label={fill(t.moveUp, { title })}
                    aria-disabled={!moveLesson(layout, l.id, -1) || undefined}
                    onClick={() => onMove(l, "up")}
                  >
                    ↑
                  </button>
                  <button
                    id={`lesson-${l.id}-down`}
                    type="button"
                    className={ed.iconBtn}
                    aria-label={fill(t.moveDown, { title })}
                    aria-disabled={!moveLesson(layout, l.id, 1) || undefined}
                    onClick={() => onMove(l, "down")}
                  >
                    ↓
                  </button>
                  <Link
                    id={`edit-lesson-${l.id}`}
                    className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`}
                    href={`/admin/koolitused/${courseId}?oppetund=${l.id}`}
                    scroll={false}
                    aria-label={fill(t.editLabel, { title })}
                    data-edit-lesson=""
                  >
                    {t.edit}
                  </Link>
                </span>
                {error && (
                  <p role="alert" className={`${ui.error} ${styles.rowError}`}>
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {/* a new key once a lesson is added: the field starts empty again */}
      <AddLessonForm key={m.lessons.length} moduleId={m.id} courseId={courseId} />
    </div>
  );
}

/** The video tag's colour: "Video puudub" and "Video viga" keep the lessons after it locked for students. */
const VIDEO_TONE: Record<AdminLesson["videoStatus"], string> = { none: ui.bad, uploading: "", processing: "", ready: ui.ok, failed: ui.bad };

/** "Lisa õppetund": a name and one button; the new lesson opens in the drawer. */
function AddLessonForm({ moduleId, courseId }: { moduleId: number; courseId: number }) {
  const uid = useId();
  const [state, action, pending] = useActionState<EditResult | null, FormData>(addLesson, null);
  const error = lessonError(state);
  return (
    <form
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      noValidate
      data-add-lesson={moduleId}
    >
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="courseId" value={courseId} />
      <div className={`${ui.field} ${styles.addField}`}>
        <label htmlFor={`add-lesson-${moduleId}`}>{t.newLesson}</label>
        <input
          id={`add-lesson-${moduleId}`}
          name="titleEt"
          className={ui.input}
          type="text"
          autoComplete="off"
          maxLength={120}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${uid}-msg`}
        />
      </div>
      <button type="submit" className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`} aria-disabled={pending || undefined}>
        {pending ? adminEt.common.saving : t.addLesson}
      </button>
      <p id={`${uid}-msg`} role="status" className={`${ui.error} ${styles.addMsg}`}>
        {error ?? ""}
      </p>
    </form>
  );
}

/** "Lisa moodul" / "Lisa punkt" at the end: a name and one button; the field is cleared once the module is there. */
function AddModuleForm({ courseId, online, field }: { courseId: number; online: boolean; field: React.RefObject<HTMLInputElement | null> }) {
  const uid = useId();
  const [value, setValue] = useState("");
  const [state, action, pending] = useActionState<EditResult | null, FormData>(addModule, null);
  // the answer is about what was sent: a changed name is not refused (nor added) yet
  const [edited, setEdited] = useState(false);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setEdited(false);
    if (state?.ok) setValue("");
  }
  const error = edited ? null : lessonError(state);
  return (
    <form
      className={`${styles.add} ${styles.addModule}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        send(action, { courseId, titleEt: value, titleRu: "" });
      }}
      noValidate
      data-add-module=""
    >
      <div className={`${ui.field} ${styles.addField}`}>
        <label htmlFor={`${uid}-name`}>{online ? t.newModule : t.newItem}</label>
        <input
          ref={field}
          id={`${uid}-name`}
          name="titleEt"
          className={ui.input}
          type="text"
          autoComplete="off"
          maxLength={120}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setEdited(true);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${uid}-msg`}
        />
      </div>
      <button type="submit" className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`} aria-disabled={pending || undefined}>
        {pending ? adminEt.common.saving : online ? t.addModule : t.addItem}
      </button>
      <p id={`${uid}-msg`} role="status" className={`${ui.error} ${styles.addMsg}`}>
        {error ?? ""}
      </p>
    </form>
  );
}
