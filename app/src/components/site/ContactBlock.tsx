"use client";

import Image from "next/image";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { submitContact } from "@/server/actions/public";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./ContactBlock.module.css";

export type ContactTexts = {
  eyebrow: string;
  title: string;
  lead: string;
  reply: string;
  name: string;
  email: string;
  message: string;
  messagePlaceholder: string;
  submit: string;
  sending: string;
  sent: string;
  errorRequired: string;
  errorEmail: string;
  errorTooMany: string;
  errorGeneric: string;
};

type Errors = Partial<Record<"name" | "email" | "message" | "form", string>>;
type State = { status: "idle" } | { status: "sent" } | { status: "error"; errors: Errors };

/**
 * Prototype D contact block (Maria C31 / H15): "Ei tea, milline koolitus sobib?" with Maria's photo and a form
 * that posts to the `submitContact` server action (storage and notification arrive in Task 10).
 */
export function ContactBlock({ locale, t, person }: { locale: Locale; t: ContactTexts; person: { name: string; photo: string } }) {
  const id = useId();
  const [values, setValues] = useState({ name: "", email: "", message: "" });
  const sentRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    try {
      const result = await submitContact(formData);
      if (result.ok) return { status: "sent" };
      const e = result.errors;
      const errors: Errors = {};
      if (e.name) errors.name = t.errorRequired;
      if (e.email) errors.email = t.errorEmail;
      if (e.message) errors.message = t.errorRequired;
      if (e.form) errors.form = e.form === "rate" ? t.errorTooMany : t.errorGeneric;
      if (Object.keys(errors).length === 0) errors.form = t.errorGeneric;
      return { status: "error", errors };
    } catch {
      return { status: "error", errors: { form: t.errorGeneric } };
    }
  }, { status: "idle" });

  // Move focus to the confirmation so screen readers and keyboard users land on it.
  useEffect(() => {
    if (state.status === "sent") sentRef.current?.focus();
  }, [state.status]);

  const errors: Errors = state.status === "error" ? state.errors : {};
  const fieldProps = (k: "name" | "email" | "message") => ({
    id: `${id}-${k}`,
    name: k,
    value: values[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `${id}-${k}-error` : undefined,
  });
  const fieldError = (k: "name" | "email" | "message") =>
    errors[k] && (
      <span id={`${id}-${k}-error`} className={styles.error}>
        {errors[k]}
      </span>
    );

  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={ui.wrap}>
        <div className={styles.contact}>
          <div>
            <p className={`${ui.caps} ${styles.eyebrow}`}>{t.eyebrow}</p>
            <h2 id={`${id}-title`} className={ui.h2}>
              {t.title}
            </h2>
            <p className={`${ui.lead} ${styles.lead}`}>{t.lead}</p>
            {person.name && (
              <div className={styles.who}>
                {person.photo && <Image className={styles.avatar} src={person.photo} alt="" width={52} height={52} unoptimized />}
                <span>
                  <b>{person.name}</b>
                  <br />
                  {t.reply}
                </span>
              </div>
            )}
          </div>

          {state.status === "sent" ? (
            <div ref={sentRef} className={styles.sent} role="status" tabIndex={-1}>
              <span className={styles.tick} aria-hidden="true">
                <Icon name="check" size={18} />
              </span>
              <p>{t.sent}</p>
            </div>
          ) : (
            <form className={styles.form} action={formAction} noValidate data-contact-form="">
              <div className={styles.field}>
                <label htmlFor={`${id}-name`}>{t.name}</label>
                <input {...fieldProps("name")} type="text" required autoComplete="name" maxLength={120} />
                {fieldError("name")}
              </div>
              <div className={styles.field}>
                <label htmlFor={`${id}-email`}>{t.email}</label>
                <input {...fieldProps("email")} type="email" required autoComplete="email" maxLength={200} />
                {fieldError("email")}
              </div>
              <div className={styles.field}>
                <label htmlFor={`${id}-message`}>{t.message}</label>
                <textarea {...fieldProps("message")} required rows={4} maxLength={2000} placeholder={t.messagePlaceholder} />
                {fieldError("message")}
              </div>
              <input type="hidden" name="locale" value={locale} />
              {/* Honeypot (Task 10): people never see or fill it. */}
              <div className={styles.honeypot} aria-hidden="true">
                <label>
                  Website
                  <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
                </label>
              </div>
              {errors.form && (
                <p className={styles.error} role="alert">
                  {errors.form}
                </p>
              )}
              <button className={`${ui.btn} ${ui.btnFull}`} type="submit" disabled={pending}>
                {pending ? t.sending : t.submit}
                <Icon name="arrow" />
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
