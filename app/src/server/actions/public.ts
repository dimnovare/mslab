"use server";

// Public form actions. Task 10 replaces these bodies with validation (zod), rate limiting, storage and notifications;
// the result shape stays: { ok: true } | { ok: false; errors: Record<field, code> }.

export type ActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Newsletter sign-up (double opt-in in Task 10). Fields: email, consent ("on"), locale, website (honeypot). */
export async function subscribe(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, errors: { email: "invalid" } };
  if (formData.get("consent") !== "on") return { ok: false, errors: { consent: "required" } };
  return { ok: true };
}
