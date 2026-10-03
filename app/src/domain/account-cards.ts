import { upcomingFrom } from "@/domain/calendar";
import { formatEUR } from "@/domain/money";
import { prepaymentDue, type RegStatus } from "@/domain/registration";
import type { I18n } from "@/i18n/field";
import { formatDate, formatDayMonth, formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";

// The client dashboard's cards and the one sentence each says about what to do next (spec 2.1 rule 5: one plain sentence
// plus at most one button). Pure: no database, no React. server/client-data.ts builds the cards (loadDashboard) and the
// components and the admin's read-only view render them; every date is an ISO string, so a card is exactly what the
// JSON endpoint sends and nothing needs converting on the way.

/** Where students pay the prepayment (settings key "prepayment", the admin's "Ettemaksu juhised"). */
export type PrepaymentInfo = { receiver: string; iban: string; bank: string; referencePrefix: string };

export type CourseRef = { slug: string; title: I18n };
export type SessionRef = { startsAt: string; city: string; venue: string };
/** A date on the calendar; `cancelled` is true when Maria called the training off. */
export type CalendarSession = SessionRef & { cancelled: boolean };

/** A contact-course registration for one session. */
export type ContactCard = {
  kind: "contact";
  registrationId: number;
  course: CourseRef;
  session: CalendarSession;
  status: RegStatus;
  paymentChoice: "full" | "half";
  /** What the registration is measured against (domain/registration.ts registrationPrice), cents; null when the course has no such price. */
  priceCents: number | null;
  paidCents: number;
  createdAt: string;
};

/** A registration without a session (an individual course): Maria agrees the time with the student. */
export type IndividualCard = {
  kind: "individual";
  registrationId: number;
  course: CourseRef;
  status: RegStatus;
  preferredPeriod: string;
  createdAt: string;
};

/** An individual-course or practice request. `title` is the course or the practice package (null when it is gone). */
export type RequestCard = {
  kind: "request";
  requestId: number;
  requestKind: "individual" | "practice";
  title: I18n | null;
  /** What was asked for, short: the preferred period (individual) or the times (practice). */
  detail: string;
  handled: boolean;
  createdAt: string;
};

export type WaitlistCard = {
  kind: "waitlist";
  requestId: number;
  course: CourseRef | null;
  session: CalendarSession | null;
  /** Maria has dealt with the entry (the admin's "Käsitletud"). */
  handled: boolean;
  createdAt: string;
};

export type EcourseCard = {
  kind: "ecourse";
  course: CourseRef;
  grantedAt: string;
  expiresAt: string;
  revoked: boolean;
};

export type AccountCard = ContactCard | IndividualCard | RequestCard | WaitlistCard | EcourseCard;

export type NextStepKey =
  | "cancelled"
  | "done"
  | "pay"
  | "invoice"
  | "confirming"
  | "confirmedRest"
  | "confirmed"
  | "individualPending"
  | "requestNew"
  | "requestDone"
  | "waitlist"
  | "accessEnded"
  | "openCourse";

export type NextStepAction =
  | { kind: "none" }
  | { kind: "pay"; registrationId: number }
  | { kind: "changeRequest"; registrationId: number }
  | { kind: "openCourse"; slug: string };

/** `key` is the sentence in the dictionary (`account.next.<key>`), `vars` fill its {placeholders}, `action` is the card's one button. */
export type NextStep = { key: NextStepKey; vars: Record<string, string>; action: NextStepAction };

/** Prepayment instructions exist when the admin filled in at least one field. */
export function hasPrepayment(pay: PrepaymentInfo | null): pay is PrepaymentInfo {
  return !!pay && [pay.receiver, pay.iban, pay.bank, pay.referencePrefix].some((v) => v.trim() !== "");
}

const NONE: NextStepAction = { kind: "none" };
const step = (key: NextStepKey, vars: Record<string, string> = {}, action: NextStepAction = NONE): NextStep => ({ key, vars, action });

/** The session has begun: the same "upcoming" as the calendar and booking (calendar.ts upcomingFrom), so a card turns "done" when its date leaves them. */
const begun = (startsAt: string, now: Date): boolean => new Date(startsAt) < upcomingFrom(now);

function contactStep(card: ContactCard, now: Date, pay: PrepaymentInfo | null, locale: Locale): NextStep {
  if (card.status === "cancelled" || card.session.cancelled) return step("cancelled");
  if (begun(card.session.startsAt, now)) return step("done");
  const rest = card.priceCents === null ? 0 : card.priceCents - card.paidCents;
  if (card.status === "awaiting_prepayment") {
    // Without a price the amount cannot be told: Maria's invoice says it.
    if (card.priceCents === null) return step("invoice");
    const due = prepaymentDue(card.priceCents, card.paymentChoice) - card.paidCents;
    // Paid enough already (the admin has not confirmed yet): nothing is left to pay.
    if (due <= 0) return step("confirming");
    return hasPrepayment(pay) ? step("pay", { amount: formatEUR(due, locale) }, { kind: "pay", registrationId: card.registrationId }) : step("invoice");
  }
  const change: NextStepAction = { kind: "changeRequest", registrationId: card.registrationId };
  if (rest > 0) return step("confirmedRest", { rest: formatEUR(rest, locale) }, change);
  const startsAt = new Date(card.session.startsAt);
  return step("confirmed", { date: formatDayMonth(startsAt, locale), time: formatTime(startsAt, locale), city: card.session.city }, change);
}

/**
 * The sentence and the button of a card. Dates and times are Estonian time and amounts are euros, formatted for `locale`
 * (the formatters of src/i18n/format.ts and domain/money.ts), so the caller only puts the vars into the dictionary text.
 * `pay` is the admin's prepayment setting (null or all empty: Maria sends an invoice).
 */
export function nextStep(card: AccountCard, now: Date, pay: PrepaymentInfo | null, locale: Locale = "et"): NextStep {
  switch (card.kind) {
    case "contact":
      return contactStep(card, now, pay, locale);
    case "individual":
      return card.status === "cancelled" ? step("cancelled") : step("individualPending");
    case "request":
      return step(card.handled ? "requestDone" : "requestNew");
    case "waitlist":
      // a called-off date ends the wait; an entry Maria has dealt with is answered
      if (card.session?.cancelled) return step("cancelled");
      return step(card.handled ? "requestDone" : "waitlist");
    case "ecourse": {
      const expiresAt = new Date(card.expiresAt);
      if (card.revoked || expiresAt <= now) return step("accessEnded");
      return step("openCourse", { date: formatDate(expiresAt, locale) }, { kind: "openCourse", slug: card.course.slug });
    }
  }
}

/** Over for the student: a past or cancelled training, a handled request, a waitlist date that has passed, ended access. */
export function isPastCard(card: AccountCard, now: Date): boolean {
  switch (card.kind) {
    case "contact":
      return card.status === "cancelled" || card.session.cancelled || begun(card.session.startsAt, now);
    case "individual":
      return card.status === "cancelled";
    case "request":
      return card.handled;
    case "waitlist":
      return card.handled || (card.session !== null && (card.session.cancelled || begun(card.session.startsAt, now)));
    case "ecourse":
      return card.revoked || new Date(card.expiresAt) <= now;
  }
}

/** The start of the session a card is about (a contact registration, a waitlist entry with a date); null for a card without a date. */
function sessionTime(card: AccountCard): number | null {
  switch (card.kind) {
    case "contact":
      return new Date(card.session.startsAt).getTime();
    case "waitlist":
      return card.session ? new Date(card.session.startsAt).getTime() : null;
    default:
      return null;
  }
}

/** When a card was made or granted: what a card without a date is placed by. */
function madeTime(card: AccountCard): number {
  return new Date(card.kind === "ecourse" ? card.grantedAt : card.createdAt).getTime();
}

/** A stable key of a card (the id of its registration, request or course) for lists. */
export function cardKey(card: AccountCard): string {
  switch (card.kind) {
    case "contact":
    case "individual":
      return `registration-${card.registrationId}`;
    case "request":
    case "waitlist":
      return `request-${card.requestId}`;
    case "ecourse":
      return `course-${card.course.slug}`;
  }
}

/** Numeric-aware, so "registration-9" comes before "registration-10". */
const byKey = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

/**
 * The order of the dashboard:
 * - open cards first, then the over ones (isPastCard);
 * - open cards with a date (a booked or waitlisted session) by that date, the soonest first;
 * - then the open cards without a date (an individual registration, a request, an e-course) by when they were made or granted, the newest first;
 * - over cards, all together, the most recent first (a session's date, else when it was made or granted).
 * Equal times keep a fixed order (by key). Does not change `cards`.
 */
export function sortCards(cards: AccountCard[], now: Date): AccountCard[] {
  return cards
    .map((card) => ({ card, past: isPastCard(card, now), session: sessionTime(card), made: madeTime(card), key: cardKey(card) }))
    .sort((a, b) => {
      if (a.past !== b.past) return a.past ? 1 : -1;
      if (a.past) return (b.session ?? b.made) - (a.session ?? a.made) || byKey(a.key, b.key);
      if (a.session !== null && b.session !== null) return a.session - b.session || byKey(a.key, b.key);
      if (a.session !== null || b.session !== null) return a.session !== null ? -1 : 1;
      return b.made - a.made || byKey(a.key, b.key);
    })
    .map((x) => x.card);
}
