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

/** A contact-course registration for one session. `cancelled` is true when the training itself was called off. */
export type ContactCard = {
  kind: "contact";
  registrationId: number;
  course: CourseRef;
  session: SessionRef & { cancelled: boolean };
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
  session: SessionRef | null;
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
      return step("waitlist");
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
      return card.session !== null && begun(card.session.startsAt, now);
    case "ecourse":
      return card.revoked || new Date(card.expiresAt) <= now;
  }
}

/** The instant a card is ordered by: a session's start, else when the request was made or the access granted. */
function cardTime(card: AccountCard): number {
  switch (card.kind) {
    case "contact":
      return new Date(card.session.startsAt).getTime();
    case "waitlist":
      return new Date(card.session?.startsAt ?? card.createdAt).getTime();
    case "ecourse":
      return new Date(card.grantedAt).getTime();
    default:
      return new Date(card.createdAt).getTime();
  }
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

/** Open cards first, over ones last; within each, the newest first (a session's date, else when it was made), then the key. Does not change `cards`. */
export function sortCards(cards: AccountCard[], now: Date): AccountCard[] {
  return cards
    .map((card) => ({ card, past: isPastCard(card, now), time: cardTime(card), key: cardKey(card) }))
    .sort((a, b) => Number(a.past) - Number(b.past) || b.time - a.time || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    .map((x) => x.card);
}
