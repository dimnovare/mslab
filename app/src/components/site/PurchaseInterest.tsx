"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { submitPurchaseInterest } from "@/server/actions/public";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./PurchaseInterest.module.css";

type State = { status: "idle" } | { status: "sent" } | { status: "error"; message: string; field: boolean };

/** Cart before bank-link payment exists (P9): "Jäta oma e-post, anname teada" — posts to submitPurchaseInterest. */
export function PurchaseInterest({
  course,
  locale,
  t,
}: {
  course: string;
  locale: Locale;
  t: { email: string; submit: string; sending: string; sent: string; errorEmail: string; errorTooMany: string; errorGeneric: string };
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const sentRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    try {
      const result = await submitPurchaseInterest(formData);
      if (result.ok) return { status: "sent" };
      if (result.errors.email) return { status: "error", message: t.errorEmail, field: true };
      return { status: "error", message: result.errors.form === "rate" ? t.errorTooMany : t.errorGeneric, field: false };
    } catch {
      return { status: "error", message: t.errorGeneric, field: false };
    }
  }, { status: "idle" });

  useEffect(() => {
    if (state.status === "sent") sentRef.current?.focus();
  }, [state.status]);

  if (state.status === "sent") {
    return (
      <div ref={sentRef} className={styles.sent} role="status" tabIndex={-1}>
        <span className={styles.tick} aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
        <p>{t.sent}</p>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;
  return (
    <form className={styles.form} action={formAction} noValidate data-interest-form="">
      <label className={styles.label} htmlFor={`${id}-email`}>
        {t.email}
      </label>
      <input
        id={`${id}-email`}
        className={styles.input}
        name="email"
        type="email"
        required
        autoComplete="email"
        maxLength={200}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error?.field ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <input type="hidden" name="course" value={course} />
      <input type="hidden" name="locale" value={locale} />
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error.message}
        </p>
      )}
      <button className={`${ui.btn} ${ui.btnFull}`} type="submit" disabled={pending}>
        {pending ? t.sending : t.submit}
        <Icon name="arrow" />
      </button>
    </form>
  );
}
