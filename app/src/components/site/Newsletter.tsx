"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { subscribe } from "@/server/actions/public";
import { Icon } from "./Icon";
import styles from "./Newsletter.module.css";

/** The texts of the sign-up itself (NewsletterForm): the field, the button, the line under it, the answers. */
export type NewsletterFormTexts = {
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  /** The line under the button: signing up is the consent ("Liitudes saad MS LABi uudiskirja. Saad igal ajal loobuda."). */
  notice: string;
  /** The link that follows the line: the name of the privacy page ("Privaatsus"). Not needed where `privacyLink` is off. */
  privacy?: string;
  sentTitle: string;
  sentText: string;
  errorEmail: string;
  errorTooMany: string;
  errorGeneric: string;
};

export type NewsletterTexts = NewsletterFormTexts & {
  eyebrow: string;
  titleFirst: string;
  titleSecond: string;
  body: string;
};

type Field = "email" | "form";
type State = { status: "idle" } | { status: "sent" } | { status: "error"; field: Field; message: string };

/**
 * B newsletter block ("MS LABi kirjad"), lilac surface, placed inside the footer (H13): the heading and the sign-up
 * (NewsletterForm).
 */
export function Newsletter({ locale, t }: { locale: Locale; t: NewsletterTexts }) {
  const id = useId();
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
      <NewsletterForm locale={locale} t={t} />
    </section>
  );
}

/**
 * The newsletter sign-up: e-mail, "Liitu", a quiet line (with the privacy link, unless `privacyLink` is off) under it, and the answer in its place.
 * Double opt-in: the action stores the address and sends a confirmation link; the answer is always "check your inbox".
 * There is no consent box: this form's only purpose is the newsletter, so sending it is the consent (the time is stored,
 * and the confirmation link still has to be opened); the line under the button says so. Used by the footer's block
 * (Newsletter) and the coming-soon page (app/tulekul/[locale]); on a lilac surface (its colours and focus ring are made
 * for it). Submitted by hand (onSubmit + startTransition), as the other forms: React resets a form after `<form action>`,
 * which would clear the e-mail after a failed attempt. The status region is always in the page (polite),
 * so the confirmation is announced; focus moves to it because the form it replaces had focus.
 * `className`: the box's own size and place (default: the footer block's column).
 * `privacyLink` (default on): the link after the line. The coming-soon page turns it off: while the gate is on, the privacy
 * page is not served to visitors (it would show the coming-soon page again), so there the line stands alone.
 */
export function NewsletterForm({
  locale,
  t,
  className = styles.form,
  privacyLink = true,
}: {
  locale: Locale;
  t: NewsletterFormTexts;
  className?: string;
  privacyLink?: boolean;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    try {
      const result = await subscribe(formData);
      if (result.ok) return { status: "sent" };
      const { errors } = result;
      if (errors.email) return { status: "error", field: "email", message: t.errorEmail };
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
    <div className={`${styles.signup} ${className}`}>
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
          {privacyLink && t.privacy ? (
            <p className={styles.notice} data-newsletter-notice="">
              {t.notice} <Link href={href(locale, "/privaatsus")}>{t.privacy}</Link>
            </p>
          ) : (
            <p className={`${styles.notice} ${styles.noticeAlone}`} data-newsletter-notice="">
              {t.notice}
            </p>
          )}
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
  );
}
