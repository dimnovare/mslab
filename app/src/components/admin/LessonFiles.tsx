"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import { deleteLessonFile } from "@/server/actions/admin-lessons";
import type { AdminLessonFile } from "@/server/admin-lessons";
import type { EditResult } from "@/server/edit-check";
import { lessonError } from "./LessonsEditor";
import ui from "./ui.module.css";
import ed from "./editor.module.css";
import cd from "./ClientDrawer.module.css";
import styles from "./LessonsEditor.module.css";

// The lesson drawer's files: the list with "Eemalda", and "Lisa fail" (the ImageUpload pattern: a visually hidden file input
// behind a button-like label). A picked file goes as it is to POST /api/admin/lesson-file, which checks its type, size and
// content (server/lesson-files.ts); here only its size is checked first, so a hopeless upload is not sent.

const t = adminEt.lessons;
const ACCEPT = ".pdf,.docx,image/jpeg,image/png,image/webp";
/** The server's limit (MAX_IMAGE_BYTES), written out: no server module enters the browser bundle. */
const MAX_BYTES = 4 * 1024 * 1024;

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done" } | { kind: "error"; text: string };
type FileProblem = "type" | "size" | "empty" | "content" | "storage" | "server";
const PROBLEMS: readonly string[] = ["type", "size", "empty", "content", "storage", "server"] satisfies FileProblem[];

/** What the upload route's answer means for Maria (null: stored). */
async function answerText(res: Response): Promise<string | null> {
  if (res.status === 201) return null;
  if (res.status === 401) return t.files.session;
  const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const error = typeof json?.error === "string" ? json.error : "";
  if (error === "notFound") return t.errors.notFound;
  if (PROBLEMS.includes(error)) return t.files[error as FileProblem];
  if (res.status === 413) return t.files.size;
  return t.files.server; // "missing" and anything else
}

export function LessonFiles({ lessonId, files }: { lessonId: number; files: AdminLessonFile[] }) {
  const uid = useId();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [removed, removeAction, removing] = useActionState<EditResult | null, FormData>(deleteLessonFile, null);
  const removeError = lessonError(removed);

  // a file removed: its row is gone, the focus goes to "Lisa fail"
  useEffect(() => {
    if (removed?.ok) input.current?.focus();
  }, [removed]);

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) return setStatus({ kind: "error", text: t.files.size });
    setStatus({ kind: "busy" });
    const body = new FormData();
    body.set("lessonId", String(lessonId));
    body.set("file", file);
    let text: string | null;
    try {
      text = await answerText(await fetch("/api/admin/lesson-file", { method: "POST", body, credentials: "same-origin" }));
    } catch {
      text = t.files.server;
    }
    if (text) return setStatus({ kind: "error", text });
    setStatus({ kind: "done" });
    router.refresh();
  };

  const busy = status.kind === "busy";
  const message = status.kind === "busy" ? t.files.uploading : status.kind === "done" ? t.files.added : status.kind === "error" ? status.text : "";

  return (
    <section className={cd.section} aria-labelledby={`${uid}-h`} data-lesson-files="">
      <h3 id={`${uid}-h`} className={ui.h3}>
        {t.files.title}
      </h3>
      {files.length === 0 ? (
        <p className={cd.none}>{t.files.none}</p>
      ) : (
        <ul className={styles.files}>
          {files.map((f) => (
            <li key={f.id} className={styles.file} data-lesson-file={f.id}>
              <span className={styles.fileName}>
                <strong>{f.name}</strong> <span className={`${ui.muted} ${ui.small}`}>{Math.ceil(f.size / 1000)} kB</span>
              </span>
              <button
                type="button"
                className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`}
                aria-label={fill(t.files.removeLabel, { name: f.name })}
                aria-disabled={removing || undefined}
                onClick={() => {
                  if (removing) return;
                  const fd = new FormData();
                  fd.set("id", String(f.id));
                  startTransition(() => removeAction(fd));
                }}
              >
                {t.files.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      {removeError && (
        <p role="alert" className={ui.error}>
          {removeError}
        </p>
      )}
      <div className={ed.upload} aria-busy={busy || undefined}>
        <input
          ref={input}
          id={`${uid}-file`}
          type="file"
          accept={ACCEPT}
          aria-describedby={`${uid}-hint ${uid}-status`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // reset at once, so the same file can be picked again
            e.target.value = "";
            if (file && !busy) void upload(file);
          }}
        />
        <label htmlFor={`${uid}-file`} className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`}>
          {t.files.add}
        </label>
        <p id={`${uid}-hint`} className={`${ui.muted} ${ed.uploadHint}`}>
          {t.files.hint}
        </p>
        <p id={`${uid}-status`} role="status" className={status.kind === "error" ? ui.error : status.kind === "done" ? ui.success : ui.hint} data-file-status={status.kind}>
          {message}
        </p>
      </div>
    </section>
  );
}
