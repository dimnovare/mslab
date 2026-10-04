"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { subscribe } from "@/server/actions/public";
import { Icon } from "./Icon";
import styles from "./Newsletter.module.css";

export type NewsletterTexts = {
  eyebrow: string;
  titleFirst: string;
  titleSecond: string;
  body: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  consent: string;
  sentTitle: string;
  sentText: string;
  errorEmail: string;
  errorRequired: string;
  errorTooMany: string;
  errorGeneric: string;
};

type Field = "email" | "consent" | "form";
type State = { status: "idle" } | { status: "sent" } | { status: "error"; field: Field; message: string };

/**
 * B newsletter block ("MS LABi kirjad"), lilac surface, placed inside the footer (H13). Double opt-in: the action
 * stores the address and sends a confirmation link; the answer is always "check your inbox".
 * Submitted by hand (onSubmit + startTransition), as the other forms: React resets a form after `<form action>`, which
 * would un-tick the controlled consent box after a failed attempt. The status region is always in the page (polite),
 * so the confirmation is announced; focus moves to it because the form it replaces had focus.
 */
export function Newsletter({ locale, t }: { locale: Locale; t: NewsletterTexts }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    try {
      const result = await subscribe(formData);
      if (result.ok) return { status: "sent" };
      const { errors } = result;
      if (errors.email) return { status: "error", field: "email", message: t.errorEmail };
      if (errors.consent) return { status: "error", field: "consent", message: t.errorRequired };
      return { status: "error", field: "form", message: errors.form === "rate" ? t.errorTooMany : t.errorGeneric };
    } catch {
      return { status: "error", field: "form", message: t.errorGeneric };
    }
  }, { status: "idle" });

  useEffect(() => {
    if (state.status === "sent") statusRef.current?.focus();
    else if (state.status === "error") document.getElementById(`${id}-${state.field}`)?.focus();
  }, [state, id]);

  const error = state.status === "error" ? state : null;
  const describe = (f: Field) => (error?.field === f ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {});

  return (
    <section className={styles.newsletter} aria-labelledby={`${id}-title`} data-footer-newsletter="">
      <div>
        <p className={styles.eyebrow}>{t.eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.title}>
          {t.titleFirst}
          <br />
          {t.titleSecond}
        </h2>
        <p className={styles.text}>{t.body}</p>
      </div>
      <div className={styles.form}>
        <div ref={statusRef} className={styles.status} role="status" tabIndex={-1} data-newsletter-status="">
          {state.status === "sent" && (
            <>
              <h3 className={styles.sentTitle}>{t.sentTitle}</h3>
              <p className={styles.text}>{t.sentText}</p>
            </>
          )}
        </div>
        {state.status !== "sent" && (
          <form
            method="post"
            noValidate
            data-newsletter-form=""
            onSubmit={(e) => {
              e.preventDefault();
              if (pending) return;
              const formData = new FormData(e.currentTarget);
              startTransition(() => formAction(formData));
            }}
          >
            <label className={styles.label} htmlFor={`${id}-email`}>
              {t.emailLabel}
            </label>
            <div className={styles.row}>
              <input
                id={`${id}-email`}
                className={styles.input}
                name="email"
                type="email"
                required
                autoComplete="email"
                maxLength={200}
                placeholder={t.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                {...describe("email")}
              />
              {/* aria-disabled, not disabled: a disabled button would drop keyboard focus to the page while sending. */}
              {/* data-fab-avoid: the review build's comment button moves up instead of covering it (N4) */}
              <button className={styles.submit} type="submit" aria-disabled={pending || undefined} data-fab-avoid="">
                {t.submit}
                <Icon name="arrow" />
              </button>
            </div>
            <label className={styles.check}>
              <input
                id={`${id}-consent`}
                type="checkbox"
                name="consent"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                {...describe("consent")}
              />
              <span>{t.consent}</span>
            </label>
            <input type="hidden" name="locale" value={locale} />
            {/* Honeypot: people never see or fill it. */}
            <div className={styles.honeypot} aria-hidden="true">
              <label>
                Website
                <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>
            {error && (
              <p id={error.field === "form" ? `${id}-form` : `${id}-error`} className={styles.error} role="alert" tabIndex={error.field === "form" ? -1 : undefined}>
                {error.message}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
