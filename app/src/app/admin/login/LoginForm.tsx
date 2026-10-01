"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./login.module.css";

export type LoginTexts = {
  emailLabel: string;
  submit: string;
  sending: string;
  sentTitle: string;
  sent: string;
  sentHint: string;
  again: string;
  errorEmail: string;
  errorTooMany: string;
  errorGeneric: string;
};

type State = { status: "idle" } | { status: "sent" } | { status: "error"; field: "email" | "form"; message: string };

/**
 * E-mail field and "Saada sisselogimislink". The answer is the same for every address (the server never tells which
 * are allowed), so the confirmation is the neutral sentence. As in the public forms: submitted by hand, the e-mail
 * stays in the field after an error, the first invalid field gets focus, the button is aria-disabled while sending
 * (a disabled one would drop keyboard focus), and the confirmation lives in a polite status region that takes focus
 * (the form it replaces had it).
 */
export function LoginForm({ t, notice }: { t: LoginTexts; notice?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [pending, setPending] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "sent") statusRef.current?.focus();
    else if (state.status === "error") (state.field === "email" ? emailRef.current : errorRef.current)?.focus();
  }, [state]);

  async function submit() {
    setPending(true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setState({ status: "sent" });
      else if (res.status === 400) setState({ status: "error", field: "email", message: t.errorEmail });
      else setState({ status: "error", field: "form", message: res.status === 429 ? t.errorTooMany : t.errorGeneric });
    } catch {
      setState({ status: "error", field: "form", message: t.errorGeneric });
    } finally {
      setPending(false);
    }
  }

  const error = state.status === "error" ? state : null;

  return (
    <>
      {notice && state.status !== "sent" && (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}
      <div ref={statusRef} className={styles.status} role="status" tabIndex={-1} data-login-status="">
        {state.status === "sent" && (
          <>
            <h2 className={styles.sentTitle}>{t.sentTitle}</h2>
            <p className={styles.sent}>{t.sent}</p>
            <p className={styles.hint}>{t.sentHint}</p>
            <button
              type="button"
              className={styles.again}
              onClick={() => {
                setState({ status: "idle" });
                requestAnimationFrame(() => emailRef.current?.focus());
              }}
            >
              {t.again}
            </button>
          </>
        )}
      </div>
      {/* Kept mounted (hidden once sent) so the typed address survives "again". */}
      <form
        method="post"
        noValidate
        hidden={state.status === "sent"}
        data-login-form=""
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          void submit();
        }}
      >
        <label className={styles.label} htmlFor={`${id}-email`}>
          {t.emailLabel}
        </label>
        <input
          ref={emailRef}
          id={`${id}-email`}
          className={styles.input}
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...(error?.field === "email" ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {})}
        />
        {/* aria-disabled, not disabled: a disabled button would drop keyboard focus to the page while sending. */}
        <button className={styles.submit} type="submit" aria-disabled={pending || undefined}>
          {pending ? t.sending : t.submit}
        </button>
        {error && (
          <p ref={errorRef} id={`${id}-error`} className={styles.error} role="alert" tabIndex={error.field === "form" ? -1 : undefined}>
            {error.message}
          </p>
        )}
      </form>
    </>
  );
}
