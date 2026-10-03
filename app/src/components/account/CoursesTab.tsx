"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import filters from "@/components/site/CatalogueFilters.module.css";
import { Icon } from "@/components/site/Icon";
import { Notice } from "@/components/site/Notice";
import ui from "@/components/site/ui.module.css";
import { cardKey, filterCards, firstName, isPastCard, showFilters, type CardFilter, type ContactCard } from "@/domain/account-cards";
import { fill } from "@/i18n/format";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import type { Dashboard } from "@/server/client-data";
import { AccountCourseCard } from "./AccountCourseCard";
import { ReplacedNotice } from "./AccountGate";
import { CardSkeleton } from "./CardSkeleton";
import { ChangeRequestDialog, type ChangeRequestEnd } from "./ChangeRequestDialog";
import { rememberChangeRequest, sentChangeRequests } from "./sent-requests";
import type { CoursesTexts } from "./texts";
import { useAccount } from "./useAccount";
import styles from "./CoursesTab.module.css";

const FILTERS: CardFilter[] = ["all", "upcoming", "past"];

type Props = {
  locale: Locale;
  t: CoursesTexts;
  /** The dashboard as the server loaded it (the admin's read-only "view as client"); without it the page loads GET /api/konto. */
  data?: Dashboard;
  /** Every button and link that would act is aria-disabled and does nothing; nothing is fetched or sent. */
  readOnly?: boolean;
  /** The time the cards are judged at (ISO), for a server render that must match its hydration; default: now. */
  now?: string;
};

/**
 * "Minu koolitused" (/konto): the greeting, the filter chips, the course cards (each with its one sentence and at most one
 * button), the empty state. With `data` it shows that (the admin's view, server-rendered); otherwise it loads the
 * signed-in client's dashboard in the browser — the page itself is a static shell, the same for every visitor.
 */
export function CoursesTab({ locale, t, data, readOnly = false, now }: Props) {
  return data ? <CoursesView data={data} locale={locale} t={t} readOnly={readOnly} at={now} /> : <CoursesLoader locale={locale} t={t} at={now} />;
}

/** GET /api/konto: two skeleton cards while it loads; the message and "Saada uus kood" when another device signed in; a plain error with "Proovi uuesti". */
function CoursesLoader({ locale, t, at }: { locale: Locale; t: CoursesTexts; at?: string }) {
  const { state, data, reload } = useAccount<Dashboard>("/api/konto", { locale });
  if (state === "ready" && data) return <CoursesView data={data} locale={locale} t={t} readOnly={false} at={at} reload={reload} />;
  if (state === "replaced") return <ReplacedNotice locale={locale} t={t} />;
  if (state === "error")
    return (
      <div data-account-state="error">
        <Notice title={t.loadError}>
          <button type="button" className={ui.btn} onClick={reload}>
            {t.retry}
            <Icon name="arrow" />
          </button>
        </Notice>
      </div>
    );
  // loading, or not signed in (on the way to the login page)
  return (
    <div className={`${ui.wrap} ${styles.page}`} aria-busy="true" data-account-state={state}>
      <span className={styles.boneTitle} aria-hidden="true" />
      <span className={styles.boneLead} aria-hidden="true" />
      <p className={ui.srOnly} role="status">
        {t.loading}
      </p>
      <div className={styles.list}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

function CoursesView({ data, locale, t, readOnly, at, reload }: { data: Dashboard; locale: Locale; t: CoursesTexts; readOnly: boolean; at?: string; reload?: () => void }) {
  // judged once, so the cards do not change under the student's hands
  const [now] = useState(() => (at ? new Date(at) : new Date()));
  const [filter, setFilter] = useState<CardFilter>("all");
  // read once: this view is first drawn in the browser (after the dashboard loaded), never on the server unless read-only
  const [sent, setSent] = useState<number[]>(() => (readOnly || typeof window === "undefined" ? [] : sentChangeRequests()));
  const [dialog, setDialog] = useState<{ card: ContactCard; opener: HTMLElement } | null>(null);
  const [justSent, setJustSent] = useState<number | null>(null);

  const openDialog = useCallback((card: ContactCard, opener: HTMLElement) => setDialog({ card, opener }), []);

  const endDialog = (end: ChangeRequestEnd) => {
    const card = dialog?.card;
    setDialog(null);
    if (!card) return;
    if (end === "sent") {
      // "Saadetud …" takes the place (and the focus) of the card's button
      rememberChangeRequest(card.registrationId);
      setSent((ids) => [...ids, card.registrationId]);
      setJustSent(card.registrationId);
    } else if (end === "stale") reload?.();
  };

  const name = firstName(data.client.name);
  const cards = filterCards(data.cards, filter, now);
  // Phones: a row to swipe through when two or more of the cards shown are still ahead (CSS; a computer shows a grid).
  const swipe = cards.filter((card) => !isPastCard(card, now)).length >= 2;

  return (
    <div className={`${ui.wrap} ${styles.page}`} data-account-dashboard="">
      <h1 className={styles.title}>{name ? fill(t.hello, { name }) : t.helloNoName}</h1>
      <p className={styles.lead}>{t.lead}</p>

      {data.cards.length === 0 ? (
        <div className={`${filters.empty} ${styles.empty}`} data-account-empty="">
          <p className={filters.emptyTitle}>{t.empty}</p>
          {readOnly ? (
            <a className={ui.btn} role="link" aria-disabled="true">
              {t.browse}
              <Icon name="arrow" />
            </a>
          ) : (
            <Link className={ui.btn} href={href(locale, "/koolitused")}>
              {t.browse}
              <Icon name="arrow" />
            </Link>
          )}
        </div>
      ) : (
        <>
          {showFilters(data.cards, now) && (
            <div className={`${filters.pills} ${styles.chips}`} role="group" aria-label={t.filterLabel} data-account-filters="">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={filters.pill}
                  aria-pressed={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setJustSent(null);
                  }}
                  data-filter={f}
                >
                  {t[f]}
                </button>
              ))}
            </div>
          )}
          <ul className={swipe ? `${styles.list} ${styles.swipe}` : styles.list} aria-label={t.listLabel} data-account-cards={swipe ? "swipe" : "list"}>
            {cards.map((card) => (
              <li key={cardKey(card)} className={styles.item}>
                <AccountCourseCard
                  card={card}
                  now={now}
                  locale={locale}
                  t={t}
                  pay={data.prepayment}
                  readOnly={readOnly}
                  sent={card.kind === "contact" && sent.includes(card.registrationId)}
                  focusSent={card.kind === "contact" && justSent === card.registrationId}
                  onChangeRequest={openDialog}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {dialog && !readOnly && <ChangeRequestDialog card={dialog.card} opener={dialog.opener} locale={locale} t={t} onEnd={endDialog} />}
    </div>
  );
}
