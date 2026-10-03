import { describe, expect, test } from "vitest";
import {
  cardKey, hasPrepayment, isPastCard, nextStep, sortCards,
  type AccountCard, type ContactCard, type EcourseCard, type IndividualCard, type PrepaymentInfo, type RequestCard, type WaitlistCard,
} from "@/domain/account-cards";
import { fill } from "@/i18n/format";
import { getDict } from "@/i18n/locales";

// The next-step sentence of every card state (spec 2.1 rule 5). NOW is a Saturday in Estonian summer time; the sessions
// are in November, in winter time (UTC+2), so 08:00 UTC is 10:00 on the card.

const NOW = new Date("2026-10-03T10:00:00Z");
const FUTURE = "2026-11-14T08:00:00.000Z"; // 14.11 at 10:00 Estonian time
const PAST = "2026-09-20T07:00:00.000Z";
const PAY: PrepaymentInfo = { receiver: "MS LAB OÜ", iban: "EE00 0000 0000 0000 0000", bank: "Pank", referencePrefix: "MS" };

const course = { slug: "kulmude-lami", title: { et: "Kulmude lamineerimine", ru: "Ламинирование бровей" } };

const contact = (over: Partial<ContactCard> = {}): ContactCard => ({
  kind: "contact", registrationId: 7, course, session: { startsAt: FUTURE, city: "Pärnu", venue: "Salong", cancelled: false },
  status: "awaiting_prepayment", paymentChoice: "full", priceCents: 35000, paidCents: 0, createdAt: "2026-10-01T09:00:00.000Z", ...over,
});
const individual = (over: Partial<IndividualCard> = {}): IndividualCard => ({
  kind: "individual", registrationId: 8, course, status: "awaiting_prepayment", preferredPeriod: "november", createdAt: "2026-10-01T09:00:00.000Z", ...over,
});
const request = (over: Partial<RequestCard> = {}): RequestCard => ({
  kind: "request", requestId: 3, requestKind: "practice", title: { et: "MINI" }, detail: "E, K", handled: false, createdAt: "2026-10-01T09:00:00.000Z", ...over,
});
const waitlist = (over: Partial<WaitlistCard> = {}): WaitlistCard => ({
  kind: "waitlist", requestId: 4, course, session: { startsAt: FUTURE, city: "Pärnu", venue: "", cancelled: false }, handled: false, createdAt: "2026-10-01T09:00:00.000Z", ...over,
});
const ecourse = (over: Partial<EcourseCard> = {}): EcourseCard => ({
  kind: "ecourse", course, grantedAt: "2026-09-22T09:00:00.000Z", expiresAt: "2027-03-22T09:00:00.000Z", revoked: false, ...over,
});

describe("nextStep: one sentence and at most one button for every state of a card", () => {
  test("contact, cancelled: nothing to do", () => {
    expect(nextStep(contact({ status: "cancelled" }), NOW, PAY)).toEqual({ key: "cancelled", vars: {}, action: { kind: "none" } });
  });

  test("contact, session started: done (the date is gone from the calendar at the same instant)", () => {
    expect(nextStep(contact({ status: "confirmed", session: { startsAt: PAST, city: "Pärnu", venue: "", cancelled: false } }), NOW, PAY)).toEqual({
      key: "done", vars: {}, action: { kind: "none" },
    });
    // a session that starts exactly now has begun (calendar.ts upcomingFrom); one a millisecond later has not
    const atNow = { startsAt: NOW.toISOString(), city: "Pärnu", venue: "", cancelled: false };
    expect(nextStep(contact({ session: atNow }), NOW, PAY).key).toBe("done");
    expect(nextStep(contact({ session: { ...atNow, startsAt: new Date(NOW.getTime() + 1).toISOString() } }), NOW, PAY).key).toBe("pay");
  });

  test("contact, a training Maria called off is cancelled too, whatever the registration says", () => {
    expect(nextStep(contact({ status: "confirmed", session: { startsAt: FUTURE, city: "Pärnu", venue: "", cancelled: true } }), NOW, PAY).key).toBe("cancelled");
  });

  test("contact, awaiting, prepayment info set: pay, with the amount and the pay button", () => {
    expect(nextStep(contact(), NOW, PAY)).toEqual({
      key: "pay", vars: { amount: "350 €" }, action: { kind: "pay", registrationId: 7 },
    });
  });

  test("the amount is the prepayment minus what was paid: half is rounded up to the cent", () => {
    expect(nextStep(contact({ paymentChoice: "half", priceCents: 35001 }), NOW, PAY).vars).toEqual({ amount: "175,01 €" });
    expect(nextStep(contact({ paymentChoice: "half", priceCents: 35001, paidCents: 1000 }), NOW, PAY).vars).toEqual({ amount: "165,01 €" });
    expect(nextStep(contact({ paymentChoice: "full", paidCents: 10000 }), NOW, PAY).vars).toEqual({ amount: "250 €" });
  });

  test("contact, awaiting, no prepayment info: invoice (none, or every field empty)", () => {
    const want = { key: "invoice", vars: {}, action: { kind: "none" } };
    expect(nextStep(contact(), NOW, null)).toEqual(want);
    expect(nextStep(contact(), NOW, { receiver: "", iban: " ", bank: "", referencePrefix: "" })).toEqual(want);
  });

  test("contact, awaiting, no price to measure by: invoice, whatever the instructions say", () => {
    expect(nextStep(contact({ priceCents: null }), NOW, PAY).key).toBe("invoice");
  });

  test("contact, awaiting but the prepayment is already in: nothing to pay, Maria confirms", () => {
    expect(nextStep(contact({ paymentChoice: "half", paidCents: 17500 }), NOW, PAY)).toEqual({ key: "confirming", vars: {}, action: { kind: "none" } });
  });

  test("contact, confirmed, something left to pay: the rest on the training day, and the change button", () => {
    expect(nextStep(contact({ status: "confirmed", paidCents: 17500 }), NOW, PAY)).toEqual({
      key: "confirmedRest", vars: { rest: "175 €" }, action: { kind: "changeRequest", registrationId: 7 },
    });
  });

  test("contact, confirmed, paid in full: where and when to meet (Estonian time), and the change button", () => {
    expect(nextStep(contact({ status: "confirmed", paidCents: 35000 }), NOW, PAY)).toEqual({
      key: "confirmed", vars: { date: "14.11", time: "10:00", city: "Pärnu" }, action: { kind: "changeRequest", registrationId: 7 },
    });
    // paid more than the price (a correction in the admin) is still "in full"; a course without a price has no rest
    expect(nextStep(contact({ status: "confirmed", paidCents: 40000 }), NOW, PAY).key).toBe("confirmed");
    expect(nextStep(contact({ status: "confirmed", priceCents: null }), NOW, PAY).key).toBe("confirmed");
  });

  test("a time in summer is Estonian summer time (UTC+3)", () => {
    const summer = contact({ status: "confirmed", paidCents: 35000, session: { startsAt: "2027-06-05T07:00:00.000Z", city: "Tartu", venue: "", cancelled: false } });
    expect(nextStep(summer, NOW, PAY).vars).toEqual({ date: "05.06", time: "10:00", city: "Tartu" });
  });

  test("individual (a registration without a session): Maria agrees the time", () => {
    const want = { key: "individualPending", vars: {}, action: { kind: "none" } };
    expect(nextStep(individual(), NOW, PAY)).toEqual(want);
    expect(nextStep(individual({ status: "confirmed" }), NOW, null)).toEqual(want);
  });

  test("individual, cancelled: cancelled (Maria is not about to call)", () => {
    expect(nextStep(individual({ status: "cancelled" }), NOW, PAY).key).toBe("cancelled");
  });

  test("request: sent, then answered", () => {
    expect(nextStep(request({ handled: false }), NOW, PAY)).toEqual({ key: "requestNew", vars: {}, action: { kind: "none" } });
    expect(nextStep(request({ handled: true }), NOW, PAY)).toEqual({ key: "requestDone", vars: {}, action: { kind: "none" } });
  });

  test("waitlist: we tell you when a place is free", () => {
    expect(nextStep(waitlist(), NOW, PAY)).toEqual({ key: "waitlist", vars: {}, action: { kind: "none" } });
    expect(nextStep(waitlist({ course: null, session: null }), NOW, null).key).toBe("waitlist");
  });

  test("waitlist, handled by Maria: answered; the date called off: cancelled, handled or not", () => {
    const called = { startsAt: FUTURE, city: "Pärnu", venue: "", cancelled: true };
    expect(nextStep(waitlist({ handled: true }), NOW, PAY)).toEqual({ key: "requestDone", vars: {}, action: { kind: "none" } });
    expect(nextStep(waitlist({ session: called }), NOW, PAY)).toEqual({ key: "cancelled", vars: {}, action: { kind: "none" } });
    expect(nextStep(waitlist({ session: called, handled: true }), NOW, PAY).key).toBe("cancelled");
    expect(nextStep(waitlist({ session: null, handled: true }), NOW, PAY).key).toBe("requestDone");
  });

  test("e-course, active: access until a date, and the open button", () => {
    expect(nextStep(ecourse(), NOW, PAY)).toEqual({
      key: "openCourse", vars: { date: "22.03.2027" }, action: { kind: "openCourse", slug: "kulmude-lami" },
    });
  });

  test("e-course, expired or revoked: access ended, no button", () => {
    const ended = { key: "accessEnded", vars: {}, action: { kind: "none" } };
    expect(nextStep(ecourse({ expiresAt: "2026-10-03T09:59:59.000Z" }), NOW, PAY)).toEqual(ended);
    expect(nextStep(ecourse({ expiresAt: NOW.toISOString() }), NOW, PAY)).toEqual(ended); // until, not including, the moment
    expect(nextStep(ecourse({ revoked: true }), NOW, PAY)).toEqual(ended);
  });
});

describe("nextStep formats the vars for the locale it is given", () => {
  test("Russian: the same dates, times and euro amounts (the formatters of the site), and Estonian is the default", () => {
    const paid = contact({ status: "confirmed", paidCents: 17500 });
    const full = contact({ status: "confirmed", paidCents: 35000 });
    expect(nextStep(paid, NOW, PAY, "ru").vars).toEqual({ rest: "175 €" });
    expect(nextStep(full, NOW, PAY, "ru").vars).toEqual({ date: "14.11", time: "10:00", city: "Pärnu" });
    expect(nextStep(ecourse(), NOW, PAY, "ru").vars).toEqual({ date: "22.03.2027" });
    expect(nextStep(full, NOW, PAY)).toEqual(nextStep(full, NOW, PAY, "et"));
  });

  test("every state's vars are exactly the placeholders of its dictionary sentence, in both languages", () => {
    const cards: AccountCard[] = [
      contact({ status: "cancelled" }), contact({ session: { startsAt: PAST, city: "x", venue: "", cancelled: false } }), contact(), contact({ priceCents: null }),
      contact({ paidCents: 35000 }), contact({ status: "confirmed", paidCents: 100 }), contact({ status: "confirmed", paidCents: 35000 }),
      individual(), request(), request({ handled: true }), waitlist(), waitlist({ handled: true }), ecourse(), ecourse({ revoked: true }),
    ];
    const keys = new Set<string>();
    for (const locale of ["et", "ru"] as const) {
      const sentences = getDict(locale).account.next as Record<string, string>;
      for (const card of cards) {
        const { key, vars } = nextStep(card, NOW, PAY, locale);
        keys.add(key);
        const placeholders = [...sentences[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(Object.keys(vars).sort(), `${locale} ${key}`).toEqual(placeholders);
        expect(fill(sentences[key], vars), `${locale} ${key}`).not.toMatch(/[{}]/);
      }
    }
    expect([...keys].sort()).toEqual(Object.keys(getDict("et").account.next).sort()); // every sentence in the dictionary is reachable
  });
});

describe("hasPrepayment", () => {
  test("any filled field counts; null and blanks do not", () => {
    expect(hasPrepayment(null)).toBe(false);
    expect(hasPrepayment({ receiver: "", iban: "  ", bank: "", referencePrefix: "" })).toBe(false);
    expect(hasPrepayment({ receiver: "", iban: "EE00", bank: "", referencePrefix: "" })).toBe(true);
    expect(hasPrepayment(PAY)).toBe(true);
  });
});

describe("isPastCard and sortCards", () => {
  const session = (startsAt: string, cancelled = false) => ({ startsAt, city: "Pärnu", venue: "", cancelled });

  test("what is over for the student", () => {
    expect(isPastCard(contact(), NOW)).toBe(false);
    expect(isPastCard(contact({ session: session(PAST) }), NOW)).toBe(true);
    expect(isPastCard(contact({ status: "cancelled" }), NOW)).toBe(true);
    expect(isPastCard(contact({ session: session(FUTURE, true) }), NOW)).toBe(true);
    expect(isPastCard(individual(), NOW)).toBe(false);
    expect(isPastCard(individual({ status: "cancelled" }), NOW)).toBe(true);
    expect(isPastCard(request(), NOW)).toBe(false);
    expect(isPastCard(request({ handled: true }), NOW)).toBe(true);
    expect(isPastCard(waitlist(), NOW)).toBe(false);
    expect(isPastCard(waitlist({ session: session(PAST) }), NOW)).toBe(true);
    expect(isPastCard(waitlist({ session: session(FUTURE, true) }), NOW)).toBe(true);
    expect(isPastCard(waitlist({ handled: true }), NOW)).toBe(true);
    expect(isPastCard(waitlist({ session: null }), NOW)).toBe(false);
    expect(isPastCard(ecourse(), NOW)).toBe(false);
    expect(isPastCard(ecourse({ revoked: true }), NOW)).toBe(true);
    expect(isPastCard(ecourse({ expiresAt: PAST }), NOW)).toBe(true);
  });

  test("open cards by date, the soonest first, then the open cards without a date, the newest first; over cards last, the most recent first; the input is left alone", () => {
    const later = contact({ registrationId: 1, session: session("2026-12-01T08:00:00.000Z") });
    const sooner = contact({ registrationId: 2, session: session("2026-11-01T08:00:00.000Z") });
    const pastRecent = contact({ registrationId: 3, session: session("2026-09-25T08:00:00.000Z") });
    const pastOld = contact({ registrationId: 4, session: session("2026-06-01T08:00:00.000Z") });
    const cancelled = contact({ registrationId: 5, status: "cancelled", session: session("2027-01-10T08:00:00.000Z") });
    const req = request({ requestId: 9, createdAt: "2026-10-02T08:00:00.000Z" });
    const course = ecourse({ grantedAt: "2026-09-30T08:00:00.000Z" });
    const pending = individual({ registrationId: 10, createdAt: "2026-10-01T08:00:00.000Z" });
    const input = [pastOld, req, cancelled, later, pastRecent, pending, course, sooner];
    const copy = [...input];
    expect(sortCards(input, NOW).map(cardKey)).toEqual([
      "registration-2", // open, with a date: 1 Nov
      "registration-1", // open, with a date: 1 Dec
      "request-9", // open, no date: made 2 Oct
      "registration-10", // open, no date: made 1 Oct
      "course-kulmude-lami", // open, no date: granted 30 Sep
      "registration-5", // over: cancelled, its date (10 Jan) is the latest
      "registration-3", // over: 25 Sep
      "registration-4", // over: 1 Jun
    ]);
    expect(input).toEqual(copy);
  });

  test("a waitlist entry with a date is placed among the dated cards; without one, among the undated", () => {
    const booked = contact({ registrationId: 1, session: session("2026-11-10T08:00:00.000Z") });
    const waiting = waitlist({ requestId: 2, session: session("2026-11-05T08:00:00.000Z") });
    const undated = waitlist({ requestId: 3, session: null, createdAt: "2026-10-02T08:00:00.000Z" });
    const old = request({ requestId: 4, createdAt: "2026-09-01T08:00:00.000Z" });
    expect(sortCards([old, undated, booked, waiting], NOW).map(cardKey)).toEqual(["request-2", "registration-1", "request-3", "request-4"]);
  });

  test("an over card without a date is placed by when it was made or granted, among the dated ones by their date", () => {
    const pastSession = contact({ registrationId: 1, session: session("2026-09-20T08:00:00.000Z") });
    const handled = request({ requestId: 2, handled: true, createdAt: "2026-09-28T08:00:00.000Z" });
    const ended = ecourse({ revoked: true, grantedAt: "2026-09-01T08:00:00.000Z" });
    expect(sortCards([ended, pastSession, handled], NOW).map(cardKey)).toEqual(["request-2", "registration-1", "course-kulmude-lami"]);
  });

  test("equal times keep a fixed order, whatever the input order (numbers by value)", () => {
    const cards = [request({ requestId: 9 }), request({ requestId: 10 }), contact({ registrationId: 2 }), contact({ registrationId: 11 })];
    const keys = sortCards(cards, NOW).map(cardKey);
    expect(keys).toEqual(["registration-2", "registration-11", "request-9", "request-10"]);
    expect(sortCards([...cards].reverse(), NOW).map(cardKey)).toEqual(keys);
  });

  test("cardKey tells registrations, requests and courses apart", () => {
    expect(cardKey(contact())).toBe("registration-7");
    expect(cardKey(individual())).toBe("registration-8");
    expect(cardKey(request())).toBe("request-3");
    expect(cardKey(waitlist())).toBe("request-4");
    expect(cardKey(ecourse())).toBe("course-kulmude-lami");
  });
});
