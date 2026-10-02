"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { logFailure } from "../log";
import { revalidatePublicLater } from "../public-cache";
import { clientIp } from "../ratelimit";
import { linkBase, requestOrigin } from "../site";
import {
  handleContact,
  handleIndividual,
  handlePractice,
  handlePurchaseInterest,
  handleRegistration,
  handleSubscribe,
  handleWaitlist,
  runSubmission,
  type ActionResult,
  type Deps,
  type FormName,
} from "../submit";

// Public form actions. Every export of a "use server" file is callable from the browser, so only the actions live
// here; validation, rate limiting, storage and notifications are in ../submit.ts (tested without Next.js).
// Result: { ok: true } | { ok: false; errors: Record<field, code> } — codes in ../forms.ts; form "rate" when rate
// limited, form "server" when storage failed.

async function run(form: FormName, handler: (deps: Deps, formData: FormData) => Promise<ActionResult>, formData: FormData): Promise<ActionResult> {
  return runSubmission(
    form,
    async (): Promise<Deps> => {
      const { env } = getCloudflareContext();
      const h = await headers();
      return {
        db: getDb(),
        env,
        // `next dev` has no edge address header: one local bucket. Production always has cf-connecting-ip.
        ip: clientIp(h) ?? (process.env.NODE_ENV === "development" ? "local" : null),
        siteUrl: linkBase(requestOrigin(h), env.SITE_URL),
        now: new Date(),
        // Notifications run after the response (the Worker's waitUntil) and never fail or slow the form.
        later: (task) => after(() => task().catch((e) => logFailure(`[forms] ${form}: notification failed`, e))),
        // a registration or waitlist entry: the calendar and the course page show the session's seats (revalidated after
        // the answer, so the POST never renders a page)
        changed: revalidatePublicLater,
      };
    },
    handler,
    formData,
  );
}

/** Home and contact page message to Maria. Fields: name, email, message, locale, website (honeypot). */
export async function submitContact(formData: FormData): Promise<ActionResult> {
  return run("contact", handleContact, formData);
}

/** Newsletter sign-up, double opt-in. Fields: email, consent ("on"), locale, website (honeypot). */
export async function subscribe(formData: FormData): Promise<ActionResult> {
  return run("subscribe", handleSubscribe, formData);
}

/**
 * Contact course, group: registration for one session, stored as `awaiting_prepayment` (P15). Fields: course (slug),
 * session (id), name, email, phone, payment (full|half), modelHelp, account, terms ("on"), locale, website.
 * Extra errors: session "full" / "unavailable" when the date can no longer be booked.
 */
export async function registerContact(formData: FormData): Promise<ActionResult> {
  return run("register", handleRegistration, formData);
}

/** Contact course, individual: a request (kind `individual`) with the preferred period; no payment choice (P12). */
export async function submitIndividual(formData: FormData): Promise<ActionResult> {
  return run("individual", handleIndividual, formData);
}

/** E-learning cart before payment opens (P9): request of kind `contact` { course, intent: "purchase", email }. */
export async function submitPurchaseInterest(formData: FormData): Promise<ActionResult> {
  return run("interest", handlePurchaseInterest, formData);
}

/** Practice request (/praktika#taotlus): request of kind `practice`. Fields: package, name, email, phone, course, times. */
export async function submitPractice(formData: FormData): Promise<ActionResult> {
  return run("practice", handlePractice, formData);
}

/** Waitlist for a full calendar session: request of kind `waitlist`. Fields: session, name, email, locale. */
export async function submitWaitlist(formData: FormData): Promise<ActionResult> {
  return run("waitlist", handleWaitlist, formData);
}
