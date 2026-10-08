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
  /** Above the sent text; "" for none (the home page's newsletter popup has its own heading). */
  sentTitle: string;
  sentText: string;
  errorEmail: string;
  errorTooMany: string;
  errorGeneric: string;
};

type Field = "email" | "form";
type State = { status: "idle" } | { status: "sent" } | { status: "error"; field: Field; message: string };

/**
 * The newsletter sign-up: e-mail, "Liitu", a quiet line (with the privacy link, unless `privacyLink` is off) under it, and the answer in its place.
 * Double opt-in: the action stores the address and sends a confirmation link; the answer is always "check your inbox".
 * There is no consent box: this form's only purpose is the newsletter, so sending it is the consent (the time is stored,
 * and the confirmation link still has to be opened); the line under the button says so, and the button is described by it
 * (a screen reader hears "signing up = consent" on the button; the e-mail field keeps its own error as its description).
 * Used by the footer's block (Newsletter), the coming-soon page (app/tulekul/[locale]) and the home page's newsletter popup
 * (NewsletterPopup); on a lilac surface or in the popup's card (its colours and focus ring are made for lilac). Submitted by hand
 * (onSubmit + startTransition), as the other forms: React resets a form after `<form action>`, which would clear the e-mail after
 * a failed attempt. The status region is always in the page (polite), so the confirmation is announced; focus moves to it
 * because the form it replaces had focus.
 * `className`: the box's own size and place (default: the footer block's column).
 * `privacyLink` (default on): the link after the line. The coming-soon page turns it off: while the gate is on, the privacy
 * page is not served to visitors (it would show the coming-soon page again), so there the line stands alone.
 * `onSent`: told once, when the address was taken (the popup remembers the sign-up in this browser).
 * `preview`: the admin's picture of the form (Hüpikaken, Task 8), which sits inside the editor's own <form>: a form never nests in a
 * form (the browser's parser drops the inner one, and the server's HTML and React's tree would differ). So the same fields in a plain
 * block, no honeypot (its input, off-screen but laid out, would count as a visible field), a button that submits nothing, and the
 * privacy word as plain text: a click in the editor never leaves the page with unsaved work.
 */
export function NewsletterForm({
  locale,
  t,
  className = styles.form,
  privacyLink = true,
  onSent,
  preview = false,
}: {
  locale: Locale;
  t: NewsletterFormTexts;
  className?: string;
  privacyLink?: boolean;
  onSent?: () => void;
  preview?: boolean;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);
  const sentTold = useRef(onSent);
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
    sentTold.current = onSent;
  });

  useEffect(() => {
    if (state.status === "sent") {
      statusRef.current?.focus();
      sentTold.current?.();
    } else if (state.status === "error") document.getElementById(`${id}-${state.field}`)?.focus();
  }, [state, id]);

  const error = state.status === "error" ? state : null;
  const describe = (f: Field) => (error?.field === f ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {});
  const withLink = privacyLink && !!t.privacy;

  const fields = (
    <>
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
        <button className={styles.submit} type={preview ? "button" : "submit"} aria-disabled={pending || undefined} aria-describedby={`${id}-notice`} data-fab-avoid="">
          {t.submit}
          <Icon name="arrow" />
        </button>
      </div>
      <p id={`${id}-notice`} className={withLink ? styles.notice : `${styles.notice} ${styles.noticeAlone}`} data-newsletter-notice="">
        {t.notice}
        {withLink && (
          <>
            {" "}
            {preview ? t.privacy : <Link href={href(locale, "/privaatsus")}>{t.privacy}</Link>}
          </>
        )}
      </p>
      <input type="hidden" name="locale" value={locale} />
      {/* Honeypot: people never see or fill it (the admin's picture has none). */}
      {!preview && (
        <div className={styles.honeypot} aria-hidden="true">
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
      )}
      {error && (
        <p id={error.field === "form" ? `${id}-form` : `${id}-error`} className={styles.error} role="alert" tabIndex={error.field === "form" ? -1 : undefined}>
          {error.message}
        </p>
      )}
    </>
  );

  return (
    <div className={`${styles.signup} ${className}`}>
      <div ref={statusRef} className={styles.status} role="status" tabIndex={-1} data-newsletter-status="">
        {state.status === "sent" && (
          <>
            {t.sentTitle && <h3 className={styles.sentTitle}>{t.sentTitle}</h3>}
            <p className={styles.text}>{t.sentText}</p>
          </>
        )}
      </div>
      {state.status !== "sent" &&
        (preview ? (
          <div data-newsletter-form="">{fields}</div>
        ) : (
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
            {fields}
          </form>
        ))}
    </div>
  );
}
