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
