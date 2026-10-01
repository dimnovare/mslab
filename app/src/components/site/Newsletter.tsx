"use client";

import { useActionState, useId, useState } from "react";
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

type State = { status: "idle" } | { status: "sent" } | { status: "error"; message: string };

/** B newsletter block ("MS LABi kirjad"), lilac surface, placed inside the footer (H13). */
export function Newsletter({ locale, t }: { locale: Locale; t: NewsletterTexts }) {
  const id = useId();
  // Controlled, so a failed attempt keeps what the visitor typed (React resets uncontrolled fields after an action).
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    try {
      const result = await subscribe(formData);
      if (result.ok) return { status: "sent" };
      const { errors } = result;
      const message = errors.email
        ? t.errorEmail
        : errors.consent
          ? t.errorRequired
          : errors.form === "rate"
            ? t.errorTooMany
            : t.errorGeneric;
      return { status: "error", message };
    } catch {
      return { status: "error", message: t.errorGeneric };
    }
  }, { status: "idle" });

  const error = state.status === "error" ? state.message : "";

  return (
    <section className={styles.newsletter} aria-labelledby={`${id}-title`}>
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
        {state.status === "sent" ? (
          <div role="status">
            <h3 className={styles.sentTitle}>{t.sentTitle}</h3>
            <p className={styles.text}>{t.sentText}</p>
          </div>
        ) : (
          <form action={formAction}>
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
                placeholder={t.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
              />
              <button className={styles.submit} type="submit" disabled={pending}>
                {t.submit}
                <Icon name="arrow" />
              </button>
            </div>
            <label className={styles.check}>
              <input type="checkbox" name="consent" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t.consent}</span>
            </label>
            <input type="hidden" name="locale" value={locale} />
            {/* Honeypot (Task 10): people never see or fill it. */}
            <div className={styles.honeypot} aria-hidden="true">
              <label>
                Website
                <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>
            {error && (
              <p id={`${id}-error`} className={styles.error} role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
