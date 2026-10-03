"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Icon } from "@/components/site/Icon";
import ui from "@/components/site/ui.module.css";
import {
  cardKey, cardTag, cardTitle, cardWhen, isPastCard, nextStep, type AccountCard, type ContactCard, type PrepaymentInfo as PaySettings,
} from "@/domain/account-cards";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { NextStepLine } from "./NextStepLine";
import { PrepaymentInfo } from "./PrepaymentInfo";
import type { CoursesTexts } from "./texts";
import styles from "./AccountCourseCard.module.css";

export type CardProps = {
  card: AccountCard;
  now: Date;
  locale: Locale;
  t: CoursesTexts;
  pay: PaySettings | null;
  readOnly: boolean;
  /** A change request was sent for this registration from this tab: the card says so instead of offering the button. */
  sent: boolean;
  /** It was sent just now: "Saadetud …" takes the focus the dialog gives back. */
  focusSent?: boolean;
  /** "Tühista või muuda aega": opens the dialog (the button is handed over, for the focus to return to it). */
  onChangeRequest(card: ContactCard, opener: HTMLElement): void;
};

/** A ref that focuses its element once, when it appears (stable, so a later render does not focus it again). */
const focusOnMount = (el: HTMLElement | null) => el?.focus();

/**
 * One course card of "Minu koolitused" (prototype B's dashboard .card): the type tag, the course, when and where, the one
 * next-step sentence and at most one button (spec 2.1 rule 5):
 * - pay → "Vaata juhiseid" opens the prepayment instructions in place;
 * - changeRequest → "Tühista või muuda aega" opens the dialog (after sending: "Saadetud. Maria võtab sinuga ühendust.");
 * - openCourse → "Ava koolitus" → /konto/kursus/{slug}.
 * `readOnly`: the button is there but aria-disabled, and does nothing.
 */
export function AccountCourseCard({ card, now, locale, t, pay, readOnly, sent, focusSent, onChangeRequest }: CardProps) {
  const step = nextStep(card, now, pay, locale);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelId = useId();
  const when = cardWhen(card, locale);
  const action = step.action;

  let button: React.ReactNode = null;
  if (action.kind === "pay") {
    button = (
      <button
        type="button"
        className={`${ui.btn} ${styles.action}`}
        aria-expanded={readOnly ? undefined : open}
        aria-controls={readOnly || !open ? undefined : panelId}
        aria-disabled={readOnly || undefined}
        onClick={() => !readOnly && setOpen((v) => !v)}
        data-card-action="pay"
      >
        {open ? t.payHide : t.pay}
      </button>
    );
  } else if (action.kind === "changeRequest") {
    button = sent ? (
      <p ref={focusSent ? focusOnMount : undefined} className={styles.sent} role="status" tabIndex={-1} data-card-sent="">
        <Icon name="check" size={18} />
        {t.request.sent}
      </p>
    ) : (
      <button
        type="button"
        className={`${ui.btnOutline} ${styles.action}`}
        aria-haspopup="dialog"
        aria-disabled={readOnly || undefined}
        onClick={(e) => !readOnly && card.kind === "contact" && onChangeRequest(card, e.currentTarget)}
        data-card-action="change"
      >
        {t.change}
      </button>
    );
  } else if (action.kind === "openCourse") {
    button = readOnly ? (
      <a className={`${ui.btn} ${styles.action}`} role="link" aria-disabled="true" data-card-action="open">
        {t.open}
        <Icon name="arrow" />
      </a>
    ) : (
      <Link className={`${ui.btn} ${styles.action}`} href={href(locale, `/konto/kursus/${action.slug}`)} data-card-action="open">
        {t.open}
        <Icon name="arrow" />
      </Link>
    );
  }

  return (
    <article
      className={styles.card}
      aria-labelledby={titleId}
      data-card={cardKey(card)}
      data-step={step.key}
      data-past={isPastCard(card, now) || undefined}
    >
      <span className={styles.tag}>{t.tag[cardTag(card)]}</span>
      {/* tabIndex -1: the dashboard puts the focus here after the card has changed under the student (a refused request) */}
      <h2 id={titleId} className={styles.title} tabIndex={-1}>
        {cardTitle(card, locale, t.untitled)}
      </h2>
      {when && (
        <p className={styles.when}>
          <span>{when.time}</span>
          {when.place && <span className={styles.place}>{when.place}</span>}
        </p>
      )}
      <NextStepLine className={styles.next} step={step} texts={t.next} />
      {button && <div className={styles.foot}>{button}</div>}
      {action.kind === "pay" && open && !readOnly && pay && (
        <PrepaymentInfo id={panelId} pay={pay} registrationId={action.registrationId} amount={step.vars.amount} t={t.payment} />
      )}
    </article>
  );
}
