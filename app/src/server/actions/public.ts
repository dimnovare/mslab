"use server";

// Public form actions. Task 10 replaces these bodies with validation (zod), rate limiting, storage and notifications;
// the result shape stays: { ok: true } | { ok: false; errors: Record<field, code> }.

export type ActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Home and contact page message to Maria (stored and forwarded in Task 10).
 * Fields: name, email, message, locale, website (honeypot). Errors: name/message "required", email "invalid".
 */
export async function submitContact(formData: FormData): Promise<ActionResult> {
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const errors: Record<string, string> = {};
  const name = field("name");
  const email = field("email");
  const message = field("message");
  if (!name || name.length > 120) errors.name = "required";
  if (!EMAIL.test(email) || email.length > 200) errors.email = "invalid";
  if (!message || message.length > 2000) errors.message = "required";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true };
}

/** Newsletter sign-up (double opt-in in Task 10). Fields: email, consent ("on"), locale, website (honeypot). */
export async function subscribe(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, errors: { email: "invalid" } };
  if (formData.get("consent") !== "on") return { ok: false, errors: { consent: "required" } };
  return { ok: true };
}

const MAX = { name: 120, email: 200, phone: 40, period: 200, message: 2000, slug: 120 } as const;
const PHONE = /^[+()\d\s-]{5,40}$/;

/** Common checks of the contact-course forms (group registration and individual request); payment is group-only. */
function contactCourseErrors(field: (k: string) => string, formData: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = field("name");
  const email = field("email");
  const phone = field("phone");
  if (!field("course") || field("course").length > MAX.slug) errors.form = "invalid";
  if (!name || name.length > MAX.name) errors.name = "required";
  if (!EMAIL.test(email) || email.length > MAX.email) errors.email = "invalid";
  if (!PHONE.test(phone)) errors.phone = "required";
  if (formData.get("terms") !== "on") errors.terms = "required";
  return errors;
}

/**
 * Contact course, group: registration for one session (P12, P14–P16). Task 10 stores it with status
 * `awaiting_prepayment` (the place is confirmed only after ≥50% has been paid, P15) and notifies Maria.
 * Fields: course (slug), session (id), name, email, phone, payment (full|half), modelHelp, account, terms ("on"),
 * locale, website (honeypot). Errors: session/name/phone/payment/terms "required", email "invalid".
 */
export async function registerContact(formData: FormData): Promise<ActionResult> {
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const errors = contactCourseErrors(field, formData);
  if (!/^\d+$/.test(field("session"))) errors.session = "required";
  if (field("payment") !== "full" && field("payment") !== "half") errors.payment = "required";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true };
}

/**
 * Contact course, individual: a request with the preferred period or date; Maria agrees the time and the payment (P12).
 * Fields as registerContact without session and payment, plus period (required) and message (optional).
 */
export async function submitIndividual(formData: FormData): Promise<ActionResult> {
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const errors = contactCourseErrors(field, formData);
  const period = field("period");
  if (!period || period.length > MAX.period) errors.period = "required";
  if (field("message").length > MAX.message) errors.message = "required";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true };
}

/**
 * E-learning cart before payment opens (P9): "let me know" e-mail. Task 10 stores it as a request of kind
 * `contact` with payload { course, intent: "purchase", email }. Fields: course (slug), email, locale, website.
 */
export async function submitPurchaseInterest(formData: FormData): Promise<ActionResult> {
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const errors: Record<string, string> = {};
  const email = field("email");
  if (!EMAIL.test(email) || email.length > MAX.email) errors.email = "invalid";
  if (!field("course") || field("course").length > MAX.slug) errors.form = "invalid";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true };
}
