"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import type { SeatState } from "@/domain/sessions";
import type { Locale } from "@/i18n/locales";
import { registerContact, submitIndividual } from "@/server/actions/public";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./CourseBuy.module.css";

type Kind = "group" | "individual";

export type SessionOption = {
  id: number;
  date: string;
  weekday: string;
  city: string;
  venue: string;
  language: string;
  state: SeatState;
  /** "Vabu kohti · 4", "Viimased kohad · 2", "Täis", "Tühistatud" */
  stateLabel: string;
  disabled: boolean;
};

export type ContactRegisterTexts = {
  participationLabel: string;
  group: string;
  individual: string;
  pickSession: string;
  noSessions: string;
  individualNote: string;
  sessionRequired: string;
  name: string;
  email: string;
  phone: string;
  paymentLabel: string;
  payFull: string;
  payHalf: string;
  modelHelp: string;
  createAccount: string;
  terms: string;
  termsLink: { label: string; href: string };
  preferredPeriod: string;
  preferredPeriodPlaceholder: string;
  message: string;
  optional: string;
  register: string;
  requestSubmit: string;
  sending: string;
  confirmAfterPrepayment: string;
  registerSuccess: string;
  individualSent: string;
  errorRequired: string;
  errorEmail: string;
  errorTooMany: string;
  errorGeneric: string;
};

type Field = "session" | "name" | "email" | "phone" | "period" | "message" | "payment" | "terms" | "form";
type Errors = Partial<Record<Field, string>>;
type State = { status: "idle" } | { status: "sent"; kind: Kind } | { status: "error"; kind: Kind; errors: Errors };

/**
 * Contact course registration (Maria's overview, P10–P16). Only the participation kinds that have a price are offered,
 * each with its own price (P12, P13). Group: pick one of the upcoming sessions (full and cancelled ones are shown but
 * cannot be picked), then the form. Individual: the same form with the preferred period or date; Maria agrees the time.
 * Payment 100% now or 50% + 50% (P14), help finding models (P11), create an account (P16), terms. A registration is
 * never confirmed by the form: the place is confirmed after at least 50% prepayment (P15) — said under the button.
 */
export function ContactRegister({
  course,
  locale,
  kinds,
  sessions,
  initialSession,
  t,
}: {
  course: string;
  locale: Locale;
  kinds: { kind: Kind; price: string }[];
  sessions: SessionOption[];
  initialSession: number | null;
  t: ContactRegisterTexts;
}) {
  const id = useId();
  const offered = kinds.map((k) => k.kind);
  const [kind, setKind] = useState<Kind>(initialSession !== null && offered.includes("group") ? "group" : (offered[0] ?? "group"));
  const [session, setSession] = useState<number | null>(initialSession);
  const [values, setValues] = useState({ name: "", email: "", phone: "", period: "", message: "" });
  const [payment, setPayment] = useState<"full" | "half">("full");
  const [checks, setChecks] = useState({ modelHelp: false, account: false, terms: false });
  const sessionRefs = useRef(new Map<number, HTMLButtonElement>());
  const sentRef = useRef<HTMLDivElement>(null);

  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    const k: Kind = formData.get("kind") === "individual" ? "individual" : "group";
    try {
      const result = k === "individual" ? await submitIndividual(formData) : await registerContact(formData);
      if (result.ok) return { status: "sent", kind: k };
      const errors: Errors = {};
      for (const [f, code] of Object.entries(result.errors)) {
        if (f === "form") errors.form = code === "rate" ? t.errorTooMany : t.errorGeneric;
        else if (f === "email") errors.email = t.errorEmail;
        else if (f === "session") errors.session = t.sessionRequired;
        else errors[f as Field] = t.errorRequired;
      }
      if (Object.keys(errors).length === 0) errors.form = t.errorGeneric;
      return { status: "error", kind: k, errors };
    } catch {
      return { status: "error", kind: k, errors: { form: t.errorGeneric } };
    }
  }, { status: "idle" });

  // Land keyboard and screen-reader users on the confirmation.
  useEffect(() => {
    if (state.status === "sent") sentRef.current?.focus();
  }, [state.status]);

  if (kinds.length === 0) return null;

  if (state.status === "sent") {
    return (
      <div ref={sentRef} className={styles.sent} role="status" tabIndex={-1} data-register-sent="">
        <span className={styles.tick} aria-hidden="true">
          <Icon name="check" size={18} />
        </span>
        <p>{state.kind === "group" ? t.registerSuccess : t.individualSent}</p>
      </div>
    );
  }

  // Errors belong to the kind that was submitted; the date error goes away once a date is picked.
  const errors: Errors = state.status === "error" && state.kind === kind ? { ...state.errors } : {};
  if (session !== null) delete errors.session;
  const err = (f: Field) =>
    errors[f] ? (
      <span id={`${id}-${f}-error`} className={styles.error}>
        {errors[f]}
      </span>
    ) : null;
  const text = (f: "name" | "email" | "phone" | "period" | "message") => ({
    id: `${id}-${f}`,
    name: f,
    value: values[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [f]: e.target.value })),
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? `${id}-${f}-error` : undefined,
  });

  // Sessions are a radio group (WAI-ARIA): arrows move between the dates that can be picked.
  const pickable = sessions.filter((s) => !s.disabled);
  const tabStop = session ?? pickable[0]?.id ?? null;
  const onSessionKey = (e: React.KeyboardEvent, current: number) => {
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!dir || pickable.length === 0) return;
    e.preventDefault();
    const at = pickable.findIndex((s) => s.id === current);
    const next = pickable[(at + dir + pickable.length) % pickable.length];
    setSession(next.id);
    sessionRefs.current.get(next.id)?.focus();
  };

  const price = (k: Kind) => kinds.find((x) => x.kind === k)?.price ?? "";

  return (
    <form
      className={styles.register}
      noValidate
      data-register-form=""
      // Submitted by hand rather than with <form action>: React resets a form after an action, which would clear the
      // checkboxes and radios in the page while their state says otherwise (all fields here are controlled).
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <fieldset className={styles.options}>
        <legend className={styles.legend}>{t.participationLabel}</legend>
        <div className={styles.kinds}>
          {kinds.map((k) => (
            <label key={k.kind} className={styles.option}>
              <input type="radio" name="kind" value={k.kind} checked={kind === k.kind} onChange={() => setKind(k.kind)} />
              <span className={styles.optionName}>{k.kind === "group" ? t.group : t.individual}</span>
              <span className={styles.optionPrice}>{price(k.kind)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "group" ? (
        <div className={styles.sessionsBlock}>
          <p id={`${id}-sessions`} className={styles.legend}>
            {t.pickSession}
          </p>
          {sessions.length === 0 ? (
            <p className={styles.muted}>{t.noSessions}</p>
          ) : (
            <div
              className={styles.sessions}
              role="radiogroup"
              aria-labelledby={`${id}-sessions`}
              aria-required="true"
              aria-invalid={errors.session ? true : undefined}
              aria-describedby={errors.session ? `${id}-session-error` : undefined}
            >
              {sessions.map((s) => (
                <button
                  key={s.id}
                  ref={(el) => {
                    if (el) sessionRefs.current.set(s.id, el);
                    else sessionRefs.current.delete(s.id);
                  }}
                  type="button"
                  role="radio"
                  className={styles.session}
                  data-session={s.id}
                  data-state={s.state}
                  aria-checked={session === s.id}
                  aria-disabled={s.disabled ? true : undefined}
                  tabIndex={!s.disabled && s.id === tabStop ? 0 : -1}
                  onClick={() => !s.disabled && setSession(s.id)}
                  onKeyDown={(e) => onSessionKey(e, s.id)}
                >
                  <span className={styles.sDate}>
                    <b>{s.date}</b>
                    <small>{s.weekday}</small>
                  </span>
                  <span className={styles.sPlace}>
                    <b>{s.city}</b>
                    {s.venue && <small>{s.venue}</small>}
                  </span>
                  <span className={styles.sLang}>{s.language}</span>
                  <span className={styles.sState}>
                    <i aria-hidden="true" />
                    {s.stateLabel}
                  </span>
                </button>
              ))}
            </div>
          )}
          {err("session")}
          {session !== null && <input type="hidden" name="session" value={session} />}
        </div>
      ) : (
        <p className={styles.note}>{t.individualNote}</p>
      )}

      <div className={styles.fields}>
        <div className={`${styles.field} ${styles.wide}`}>
          <label htmlFor={`${id}-name`}>{t.name}</label>
          <input {...text("name")} type="text" required autoComplete="name" maxLength={120} />
          {err("name")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-email`}>{t.email}</label>
          <input {...text("email")} type="email" required autoComplete="email" maxLength={200} />
          {err("email")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-phone`}>{t.phone}</label>
          <input {...text("phone")} type="tel" required autoComplete="tel" maxLength={40} />
          {err("phone")}
        </div>
        {kind === "individual" && (
          <>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor={`${id}-period`}>{t.preferredPeriod}</label>
              <input {...text("period")} type="text" required maxLength={200} placeholder={t.preferredPeriodPlaceholder} />
              {err("period")}
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor={`${id}-message`}>
                {t.message} <span className={styles.optional}>({t.optional})</span>
              </label>
              <textarea {...text("message")} rows={3} maxLength={2000} />
              {err("message")}
            </div>
          </>
        )}
      </div>

      <fieldset className={styles.options}>
        <legend className={styles.legend}>{t.paymentLabel}</legend>
        <div className={styles.pay}>
          {(["full", "half"] as const).map((p) => (
            <label key={p} className={styles.option}>
              <input type="radio" name="payment" value={p} checked={payment === p} onChange={() => setPayment(p)} />
              <span className={styles.optionName}>{p === "full" ? t.payFull : t.payHalf}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.checks}>
        <label className={styles.check}>
          <input type="checkbox" name="modelHelp" checked={checks.modelHelp} onChange={(e) => setChecks((c) => ({ ...c, modelHelp: e.target.checked }))} />
          <span>{t.modelHelp}</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="account" checked={checks.account} onChange={(e) => setChecks((c) => ({ ...c, account: e.target.checked }))} />
          <span>{t.createAccount}</span>
        </label>
        <div>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="terms"
              required
              checked={checks.terms}
              onChange={(e) => setChecks((c) => ({ ...c, terms: e.target.checked }))}
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={errors.terms ? `${id}-terms-error` : undefined}
            />
            <span>{t.terms}</span>
          </label>
          <a className={styles.termsLink} href={t.termsLink.href} target="_blank" rel="noopener">
            {t.termsLink.label} ↗
          </a>
          {err("terms")}
        </div>
      </div>

      <input type="hidden" name="course" value={course} />
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
        {pending ? t.sending : kind === "group" ? t.register : t.requestSubmit}
        <Icon name="arrow" />
      </button>
      <p className={styles.info}>{t.confirmAfterPrepayment}</p>
    </form>
  );
}
