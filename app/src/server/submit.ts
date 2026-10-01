import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { courses, courseSessions, practicePackages, registrations, requests, subscribers } from "@/db/schema";
import type { Course, CourseSession, Registration, Subscriber } from "@/db/schema";
import { seatState } from "@/domain/sessions";
import { pick } from "@/i18n/field";
import { fill } from "@/i18n/format";
import { getDict } from "@/i18n/locales";
import {
  isSpam,
  parseContact,
  parseGroupRegistration,
  parseIndividual,
  parsePractice,
  parsePurchaseInterest,
  parseSubscribe,
  parseWaitlist,
  type Parsed,
  type RegistrationInput,
} from "./forms";
import {
  contactSummary,
  individualSummary,
  practiceSummary,
  purchaseInterestSummary,
  registrationSummary,
  waitlistSummary,
  type Summary,
} from "./messages";
import { adminUrl, notifyMaria, sendMail, type Env, type Mail } from "./notify";
import { RATE_LIMIT, RATE_WINDOW_SEC, rateKey, rateLimit } from "./ratelimit";

// The public form submissions without Next.js: actions/public.ts builds the dependencies (database, Worker env,
// visitor IP, after()) and calls these, and the tests call them with PGlite and fakes.
//
// Every submission: honeypot → validation → rate limit (5 per 10 min per form and IP) → checks against the database
// → storage → notifications after the response. Storage is the contract; a failed e-mail or Telegram ping is logged
// and never fails the request.

export type ActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

export type Deps = {
  db: Db;
  env: Env;
  /** The visitor's address (rate limit key). */
  ip: string;
  now: Date;
  /** Runs work after the response has been sent: next/server after() in production, collected and awaited in tests. */
  later: (task: () => Promise<unknown>) => void;
};

export type FormName = "contact" | "subscribe" | "register" | "individual" | "interest" | "practice" | "waitlist";

const OK: ActionResult = { ok: true };
const fail = (errors: Record<string, string>): ActionResult => ({ ok: false, errors });

/** Confirmation e-mails per address and day (signing up again resends the link; this stops mail-bombing an address). */
const CONFIRM_MAILS_PER_DAY = 3;

type Stored = { result: ActionResult; notify?: Summary & { replyTo?: string }; mail?: Mail };

/** A rate limit that fails open: when KV is unavailable (or over its daily write quota) the submission goes through. */
async function allowed(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    return await rateLimit(env.KV, key, limit, windowSec);
  } catch (e) {
    console.error("[forms] rate limit unavailable, allowing:", e instanceof Error ? e.message : e);
    return true;
  }
}

async function submission<T>(
  deps: Deps,
  form: FormName,
  formData: FormData,
  parse: (fd: FormData) => Parsed<T>,
  store: (data: T) => Promise<Stored>,
): Promise<ActionResult> {
  if (isSpam(formData)) {
    console.info(`[forms] ${form}: honeypot filled, nothing stored`);
    return OK;
  }
  const parsed = parse(formData);
  if (!parsed.ok) return fail(parsed.errors);
  if (!(await allowed(deps.env, rateKey(form, deps.ip), RATE_LIMIT, RATE_WINDOW_SEC))) {
    console.info(`[forms] ${form}: rate limited`);
    return fail({ form: "rate" });
  }
  const out = await store(parsed.data);
  const { notify, mail } = out;
  if (notify) {
    deps.later(async () => {
      const r = await notifyMaria(deps.env, notify.subject, notify.text, { short: notify.short, replyTo: notify.replyTo });
      console.info(`[forms] ${form}: stored; Maria notified by e-mail: ${r.mail}, Telegram: ${r.telegram}`);
    });
  }
  if (mail) {
    deps.later(async () => {
      const sent = await sendMail(deps.env, mail);
      console.info(`[forms] ${form}: stored; confirmation e-mail sent: ${sent}`);
    });
  }
  return out.result;
}

const admin = (deps: Deps) => adminUrl(deps.env);

// ---------- registrations ----------

/** Stores a contact-course registration. The status is always `awaiting_prepayment` (a place is confirmed only
 *  after at least 50% prepayment, P15) and nothing has been paid. */
export async function createRegistration(db: Db, input: RegistrationInput): Promise<Registration> {
  const [row] = await db
    .insert(registrations)
    .values({
      courseId: input.courseId,
      courseSessionId: input.courseSessionId ?? null,
      kind: input.kind,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      paymentChoice: input.paymentChoice,
      wantsModelHelp: input.wantsModelHelp,
      wantsAccount: input.wantsAccount,
      preferredPeriod: input.preferredPeriod.trim(),
      message: input.message.trim(),
      locale: input.locale,
      status: "awaiting_prepayment",
      paidCents: 0,
    })
    .returning();
  return row;
}

/** A published contact course by slug. */
async function contactCourse(db: Db, slug: string): Promise<Course | null> {
  const [row] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.slug, slug), eq(courses.published, true), eq(courses.type, "contact")))
    .limit(1);
  return row ?? null;
}

/** A session with its confirmed registrations, counted now (the page the visitor saw may be out of date). */
async function sessionWithSeats(db: Db, id: number): Promise<(CourseSession & { confirmed: number }) | null> {
  const [session] = await db.select().from(courseSessions).where(eq(courseSessions.id, id)).limit(1);
  if (!session) return null;
  const [{ confirmed }] = await db
    .select({ confirmed: sql<number>`count(*)`.mapWith(Number) })
    .from(registrations)
    .where(and(eq(registrations.courseSessionId, id), eq(registrations.status, "confirmed")));
  return { ...session, confirmed };
}

/** Group registration for one session of a contact course (P12–P16). */
export function handleRegistration(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "register", formData, parseGroupRegistration, async ({ course: slug, courseSessionId, terms: _terms, ...data }) => {
    void _terms;
    const course = await contactCourse(deps.db, slug);
    if (!course || course.priceGroup == null) return { result: fail({ form: "invalid" }) };
    const session = await sessionWithSeats(deps.db, courseSessionId);
    // Another course's session, a cancelled one or one that has already started cannot be booked.
    if (!session || session.courseId !== course.id || session.status !== "scheduled" || session.startsAt < deps.now)
      return { result: fail({ session: "unavailable" }) };
    if (seatState(session, session.confirmed) === "full") return { result: fail({ session: "full" }) };

    await createRegistration(deps.db, { ...data, courseId: course.id, courseSessionId: session.id, kind: "group", preferredPeriod: "", message: "" });
    const summary = registrationSummary(
      { ...data, course: pick(course.title, "et"), startsAt: session.startsAt, city: session.city, venue: session.venue },
      admin(deps),
    );
    return { result: OK, notify: { ...summary, replyTo: data.email } };
  });
}

// ---------- requests ----------

type RequestKind = (typeof requests.$inferInsert)["kind"];
type Payload = Record<string, string | number | boolean>;

async function storeRequest(db: Db, kind: RequestKind, payload: Payload): Promise<void> {
  await db.insert(requests).values({ kind, payload });
}

/** Individual contact course: a request to Maria with the preferred period; no payment choice (P12). */
export function handleIndividual(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "individual", formData, parseIndividual, async ({ course: slug, terms: _terms, ...data }) => {
    void _terms;
    const course = await contactCourse(deps.db, slug);
    if (!course || course.priceIndividual == null) return { result: fail({ form: "invalid" }) };
    await storeRequest(deps.db, "individual", { course: slug, courseId: course.id, ...data });
    const summary = individualSummary({ ...data, course: pick(course.title, "et") }, admin(deps));
    return { result: OK, notify: { ...summary, replyTo: data.email } };
  });
}

/** Message to Maria (home page, /kontakt). */
export function handleContact(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "contact", formData, parseContact, async (data) => {
    await storeRequest(deps.db, "contact", data);
    return { result: OK, notify: { ...contactSummary(data, admin(deps)), replyTo: data.email } };
  });
}

/** E-learning cart before payment exists (P9): a contact request { course, intent: "purchase", email }. */
export function handlePurchaseInterest(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "interest", formData, parsePurchaseInterest, async ({ course: slug, email, locale }) => {
    const [course] = await deps.db
      .select()
      .from(courses)
      .where(and(eq(courses.slug, slug), eq(courses.published, true), eq(courses.type, "e_learning")))
      .limit(1);
    if (!course) return { result: fail({ form: "invalid" }) };
    await storeRequest(deps.db, "contact", { course: slug, intent: "purchase", email, locale });
    return { result: OK, notify: { ...purchaseInterestSummary({ course: pick(course.title, "et"), email, locale }, admin(deps)), replyTo: email } };
  });
}

/** Practice request (/praktika): Maria agrees the time afterwards; nothing is booked. */
export function handlePractice(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "practice", formData, parsePractice, async (data) => {
    const [pkg] = await deps.db.select().from(practicePackages).where(eq(practicePackages.code, data.package)).limit(1);
    if (!pkg) return { result: fail({ package: "required" }) };
    await storeRequest(deps.db, "practice", { ...data, package: pkg.code });
    const summary = practiceSummary({ ...data, package: `${pick(pkg.name, "et")} (${pkg.code})` }, admin(deps));
    return { result: OK, notify: { ...summary, replyTo: data.email } };
  });
}

/** Waitlist for a (full) calendar session. */
export function handleWaitlist(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "waitlist", formData, parseWaitlist, async ({ session: sessionId, ...data }) => {
    const [row] = await deps.db
      .select({ session: courseSessions, course: courses })
      .from(courseSessions)
      .innerJoin(courses, eq(courseSessions.courseId, courses.id))
      .where(and(eq(courseSessions.id, sessionId), eq(courses.published, true)))
      .limit(1);
    if (!row || row.session.status !== "scheduled") return { result: fail({ form: "invalid" }) };
    const { session, course } = row;
    await storeRequest(deps.db, "waitlist", { session: session.id, course: course.slug, ...data });
    const summary = waitlistSummary(
      { ...data, course: pick(course.title, "et"), startsAt: session.startsAt, city: session.city, venue: session.venue },
      admin(deps),
    );
    return { result: OK, notify: { ...summary, replyTo: data.email } };
  });
}

// ---------- newsletter (double opt-in) ----------

/** 32 random bytes, base64url (43 characters). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const confirmUrl = (env: Pick<Env, "SITE_URL">, token: string) =>
  `${env.SITE_URL.replace(/\/+$/, "")}/api/newsletter/confirm?t=${encodeURIComponent(token)}`;

function confirmationMail(env: Env, sub: Pick<Subscriber, "email" | "token" | "locale">): Mail {
  const m = getDict(sub.locale === "ru" ? "ru" : "et").mail;
  return { to: sub.email, subject: m.confirmSubject, text: fill(m.confirmText, { link: confirmUrl(env, sub.token) }) };
}

/**
 * Newsletter sign-up. The answer is always the same "check your inbox", so the form never tells whether an address
 * is already subscribed. A new address is stored unconfirmed and gets the confirmation link; an unconfirmed one gets
 * the same link again (new consent time); a confirmed one gets nothing.
 */
export function handleSubscribe(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "subscribe", formData, parseSubscribe, async ({ email, locale }) => {
    const [created] = await deps.db
      .insert(subscribers)
      .values({ email, locale, token: newToken(), consentAt: deps.now })
      .onConflictDoNothing({ target: subscribers.email })
      .returning();
    let sub: Subscriber | undefined = created;
    if (!sub) {
      const [existing] = await deps.db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1);
      if (!existing || existing.confirmedAt) return { result: OK };
      [sub] = await deps.db.update(subscribers).set({ consentAt: deps.now, locale }).where(eq(subscribers.id, existing.id)).returning();
    }
    if (!(await allowed(deps.env, `rl:confirm:${await sha256(email)}`, CONFIRM_MAILS_PER_DAY, 24 * 60 * 60))) {
      console.info("[forms] subscribe: confirmation e-mails for this address are paused for today");
      return { result: OK };
    }
    return { result: OK, mail: confirmationMail(deps.env, sub) };
  });
}

/** The confirmation link: sets `confirmedAt` once (later clicks keep the first time). null = unknown token. */
export async function confirmSubscriber(db: Db, token: string, now: Date): Promise<Subscriber | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db.select().from(subscribers).where(eq(subscribers.token, token)).limit(1);
  if (!row) return null;
  if (row.confirmedAt) return row;
  const [updated] = await db.update(subscribers).set({ confirmedAt: now }).where(eq(subscribers.id, row.id)).returning();
  return updated ?? row;
}
