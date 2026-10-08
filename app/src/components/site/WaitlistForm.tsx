"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { submitWaitlist } from "@/server/actions/public";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./Calendar.module.css";
import checks from "./CourseBuy.module.css";

export type WaitlistTexts = {
  title: string;
  lead: string;
  name: string;
  email: string;
  newsletterConsent: string;
  submit: string;
  sending: string;
  sent: string;
  errorRequired: string;
  errorEmail: string;
  errorTooMany: string;
  errorGeneric: string;
};

type Field = "name" | "email" | "form";
type Errors = Partial<Record<Field, string>>;
type State = { status: "idle" } | { status: "sent" } | { status: "error"; errors: Errors };

/**
 * "Liitu ootenimekirjaga" on a full calendar session (prototype A, A3): name and e-mail for that session → submitWaitlist
 * (stored as a `waitlist` request). Opens with focus in the name field; after a failed submit focus goes to
 * the first field with an error, after success to the confirmation.
 */
export function WaitlistForm({ session, context, locale, t }: { session: number; context: string; locale: Locale; t: WaitlistTexts }) {
  const id = useId();
  const [values, setValues] = useState({ name: "", email: "" });
  const nameRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    try {
      const result = await submitWaitlist(formData);
      if (result.ok) return { status: "sent" };
      const errors: Errors = {};
      if (result.errors.name) errors.name = t.errorRequired;
      if (result.errors.email) errors.email = t.errorEmail;
      if (result.errors.form) errors.form = result.errors.form === "rate" ? t.errorTooMany : t.errorGeneric;
      if (Object.keys(errors).length === 0) errors.form = t.errorGeneric;
      return { status: "error", errors };
    } catch {
      return { status: "error", errors: { form: t.errorGeneric } };
    }
  }, { status: "idle" });

  // The form was opened from the row's button: start typing right away.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.status === "sent") sentRef.current?.focus();
    else if (state.status === "error") {
      const first = (["name", "email"] as const).find((f) => state.errors[f]);
      document.getElementById(first ? `${id}-${first}` : `${id}-form-error`)?.focus();
    }
  }, [state, id]);

  if (state.status === "sent") {
    return (
      <div ref={sentRef} className={styles.sent} role="status" tabIndex={-1} data-waitlist-sent="">
        <span className={styles.tick} aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
        <p>{t.sent}</p>
      </div>
    );
  }

  const errors: Errors = state.status === "error" ? state.errors : {};
  const field = (f: "name" | "email") => ({
    id: `${id}-${f}`,
    name: f,
    value: values[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [f]: e.target.value })),
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? `${id}-${f}-error` : undefined,
  });
  const err = (f: Field) =>
    errors[f] && f !== "form" ? (
      <span id={`${id}-${f}-error`} className={styles.error}>
        {errors[f]}
      </span>
    ) : null;

  return (
    <form
      className={styles.waitlist}
      method="post"
      noValidate
      aria-labelledby={`${id}-title`}
      data-waitlist-form=""
      // Submitted by hand, as the other forms: method="post" keeps the e-mail out of the URL without the script.
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <div className={styles.waitlistHead}>
        <h3 id={`${id}-title`} className={styles.waitlistTitle}>
          {t.title}
        </h3>
        <p className={styles.waitlistContext}>{context}</p>
        <p className={styles.waitlistLead}>{t.lead}</p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-name`}>{t.name}</label>
        <input ref={nameRef} {...field("name")} type="text" required autoComplete="name" maxLength={120} />
        {err("name")}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-email`}>{t.email}</label>
        <input {...field("email")} type="email" required autoComplete="email" maxLength={200} />
        {err("email")}
      </div>
      <label className={`${checks.check} ${styles.waitlistConsent}`}>
        <input type="checkbox" name="newsletter" />
        <span>{t.newsletterConsent}</span>
      </label>
      <input type="hidden" name="session" value={session} />
      <input type="hidden" name="locale" value={locale} />
      {/* Honeypot: people never see or fill it. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {errors.form && (
        <p id={`${id}-form-error`} className={styles.error} role="alert" tabIndex={-1}>
          {errors.form}
        </p>
      )}
      <button className={`${ui.btn} ${styles.waitlistSubmit}`} type="submit" aria-disabled={pending || undefined}>
        {pending ? t.sending : t.submit}
        <Icon name="arrow" />
      </button>
    </form>
  );
}
