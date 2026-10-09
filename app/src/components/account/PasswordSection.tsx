"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import ui from "@/components/site/ui.module.css";
import { passwordProblem } from "@/domain/password";
import { fill, formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { isDone, sendJson } from "@/lib/json-request";
import type { Reload } from "./AccountLoader";
import type { DetailsTexts } from "./texts";
import fields from "./LoginForm.module.css";
import styles from "./DetailsTab.module.css";

type Mode = "view" | "edit" | "confirm";
type Status = { text: string; error: boolean } | null;
/** Where the focus goes after the next render: the form's first field, the button that opens the form, "Eemalda parool", or the removal question. */
type FocusTarget = "field" | "opener" | "remove" | "question";

/**
 * Minu andmed → "Parool" (phase 2c, spec 7). Without a password: one sentence (the code always works) and "Määra parool". With one:
 * "Parool on määratud (muudetud {date})." with "Muuda parooli" and a quiet "Eemalda parool" that asks once (as "Kustuta konto"). The
 * form: the new password twice, checked here as the server checks it (10 … 200 characters, not the e-mail address, domain/password.ts)
 * and that the two are the same, so a refused try is never sent (the server counts those toward its 5 changes an hour); "Salvesta
 * parool" (an outline button: the profile's "Salvesta" stays the screen's one primary button) and "Tühista". Each change is mailed to
 * her by the server; the session goes on. A 401 reloads the page's data quietly.
 */
export function PasswordSection({ email, setAt: initial, locale, t, reload }: { email: string; setAt: string | null; locale: Locale; t: DetailsTexts["password"]; reload: Reload }) {
  const ids = { title: useId(), password: useId(), repeat: useId(), error: useId(), question: useId() };
  const [setAt, setSetAt] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLDivElement>(null);
  const focusNext = useRef<FocusTarget | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target === "field") first.current?.focus();
    else if (target === "opener") opener.current?.focus();
    else if (target === "remove") removeButton.current?.focus();
    else if (target === "question") {
      question.current?.focus({ preventScroll: true });
      question.current?.scrollIntoView?.({ block: "nearest" }); // clear of the sticky header and, on a phone, of the tab bar (scroll margins in DetailsTab.module.css)
    }
  });

  const open = () => {
    setMode("edit");
    setPassword("");
    setRepeat("");
    setError(null);
    setStatus(null);
    focusNext.current = "field";
  };
  const closeForm = () => {
    if (busy.current) return;
    setMode("view");
    setError(null);
    focusNext.current = "opener";
  };
  const askToRemove = () => {
    setMode("confirm");
    setStatus(null);
    focusNext.current = "question";
  };
  /** "Tühista" and Esc: back to "Eemalda parool", with the focus on it and a failed try's words gone (as "Kustuta konto"). */
  const closeQuestion = () => {
    if (busy.current) return;
    setMode("view");
    setStatus(null);
    focusNext.current = "remove";
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const problem = passwordProblem(password, email);
    const local = problem ? t[problem] : password !== repeat ? t.mismatch : null;
    if (local) {
      setError(local);
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    const answer = await sendJson("/api/konto/parool", { password });
    busy.current = false;
    setPending(false);
    if (isDone(answer) && typeof answer.data.passwordSetAt === "string") {
      setSetAt(answer.data.passwordSetAt);
      setPassword("");
      setRepeat("");
      setMode("view");
      setStatus({ text: t.saved, error: false });
      focusNext.current = "opener";
      return;
    }
    if (answer.status === 401) return void reload({ quiet: true });
    const code = answer.data.error;
    setError(code === "short" || code === "long" || code === "email" ? t[code] : code === "rate" ? t.rate : t.failed);
  };

  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const answer = await sendJson("/api/konto/parool", {}, { method: "DELETE" });
    busy.current = false;
    setPending(false);
    if (isDone(answer)) {
      setSetAt(null);
      setMode("view");
      setStatus({ text: t.removed, error: false });
      focusNext.current = "opener";
      return;
    }
    if (answer.status === 401) return void reload({ quiet: true });
    setStatus({ text: t.removeFailed, error: true }); // DELETE has no "rate" answer (it sends nothing that is counted), so this is all that can fail
  };

  return (
    <section className={styles.password} aria-labelledby={ids.title} data-details-password="">
      <h2 id={ids.title} className={styles.sectionTitle}>
        {t.title}
      </h2>
      {mode === "edit" ? (
        <form onSubmit={save} noValidate data-password-form="">
          <div className={fields.field}>
            <label htmlFor={ids.password}>{t.newPassword}</label>
            <input
              ref={first}
              id={ids.password}
              type="password"
              autoComplete="new-password"
              maxLength={400}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={ids.error}
            />
          </div>
          <div className={fields.field}>
            <label htmlFor={ids.repeat}>{t.repeat}</label>
            <input
              id={ids.repeat}
              type="password"
              autoComplete="new-password"
              maxLength={400}
              value={repeat}
              onChange={(e) => {
                setRepeat(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={ids.error}
            />
          </div>
          <p id={ids.error} className={fields.error} role="alert" data-password-error="">
            {error ?? ""}
          </p>
          <div className={styles.answers}>
            <button type="submit" className={ui.btnOutline} aria-disabled={pending || undefined} data-password-save="">
              {t.save}
            </button>
            <button type="button" className={styles.quiet} onClick={closeForm} data-password-cancel="">
              {t.cancel}
            </button>
          </div>
        </form>
      ) : setAt ? (
        <>
          <p className={styles.passwordLine} data-password-state="set">
            {fill(t.isSet, { date: formatDate(new Date(setAt), locale) })}
          </p>
          <div className={styles.answers}>
            <button ref={opener} type="button" className={ui.btnOutline} onClick={open} data-password-change="">
              {t.change}
            </button>
          </div>
          {mode === "confirm" ? (
            <div
              ref={question}
              className={`${styles.confirm} ${styles.passwordConfirm}`}
              role="group"
              aria-labelledby={ids.question}
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeQuestion();
              }}
              data-password-confirm=""
            >
              <p id={ids.question} className={styles.question}>
                {t.removeQuestion}
              </p>
              <div className={styles.answers}>
                <button type="button" className={`${ui.btn} ${styles.yes}`} onClick={() => void remove()} aria-disabled={pending || undefined} data-password-remove-yes="">
                  {t.removeYes}
                </button>
                <button type="button" className={ui.btnOutline} onClick={closeQuestion} aria-disabled={pending || undefined} data-password-remove-no="">
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button ref={removeButton} type="button" className={styles.deleteLink} onClick={askToRemove} data-password-remove="">
              {t.remove}
            </button>
          )}
        </>
      ) : (
        <>
          <p className={styles.passwordLine} data-password-state="none">
            {t.none}
          </p>
          <button ref={opener} type="button" className={ui.btnOutline} onClick={open} data-password-set="">
            {t.set}
          </button>
        </>
      )}
      <p className={status?.error ? fields.error : fields.status} role="status" data-password-status="">
        {status?.text ?? ""}
      </p>
    </section>
  );
}
