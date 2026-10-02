import { describe, expect, test } from "vitest";
import {
  isSpam,
  parseContact,
  parseGroupRegistration,
  parseIndividual,
  parsePractice,
  parsePurchaseInterest,
  parseSubscribe,
  parseWaitlist,
  registrationSchema,
} from "@/server/forms";

// Task 10 brief test (verbatim), then the forms' error-code contract (moved here from the Task 8/9 placeholder tests:
// the actions now need the Worker env, the parsing they start with does not).

test("registration requires terms and a session for group", () => {
  const base = { courseId: 1, kind: "group", name: "A B", email: "a@example.ee", phone: "+372 5555", paymentChoice: "half", terms: "on" };
  expect(registrationSchema.safeParse({ ...base, courseSessionId: 3 }).success).toBe(true);
  expect(registrationSchema.safeParse(base).success).toBe(false);
  expect(registrationSchema.safeParse({ ...base, courseSessionId: 3, terms: undefined }).success).toBe(false);
  expect(registrationSchema.safeParse({ ...base, kind: "individual", preferredPeriod: "november" }).success).toBe(true);
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const errors = (r: { ok: boolean; errors?: Record<string, string> }) => (r.ok ? null : r.errors);
const base = { course: "kulmumeistri-baaskoolitus", name: "Test Õpilane", email: "test@example.com", phone: "+372 5555 5555", payment: "half", terms: "on", locale: "et" };

describe("group registration form", () => {
  test("accepts a complete registration and maps the form names to the stored fields", () => {
    const r = parseGroupRegistration(form({ ...base, session: "12", modelHelp: "on" }));
    expect(r).toEqual({
      ok: true,
      data: {
        course: "kulmumeistri-baaskoolitus",
        courseSessionId: 12,
        name: "Test Õpilane",
        email: "test@example.com",
        phone: "+372 5555 5555",
        paymentChoice: "half",
        wantsModelHelp: true,
        wantsAccount: false,
        terms: "on",
        locale: "et",
      },
    });
  });
  test("needs a session, contact details, a payment choice and the terms", () => {
    expect(errors(parseGroupRegistration(form({ course: "x", email: "nope", phone: "abc", payment: "all" })))).toEqual({
      session: "required",
      name: "required",
      email: "invalid",
      phone: "required",
      payment: "required",
      terms: "required",
    });
  });
  test("instalment is not a payment choice yet (P14: shown disabled; a forged form is refused)", () => {
    expect(errors(parseGroupRegistration(form({ ...base, session: "3", payment: "instalment" })))).toEqual({ payment: "required" });
  });
  test("phone is required", () => {
    expect(errors(parseGroupRegistration(form({ ...base, session: "3", phone: "" })))).toEqual({ phone: "required" });
  });
  test("a course slug is required (the visitor cannot see it: form error)", () => {
    expect(errors(parseGroupRegistration(form({ ...base, course: "", session: "1" })))).toEqual({ form: "invalid" });
    expect(errors(parseGroupRegistration(form({ ...base, course: "../admin", session: "1" })))).toEqual({ form: "invalid" });
  });
  test("session ids must be positive integers", () => {
    for (const session of ["0", "-1", "1.5", "abc", "99999999999"])
      expect(errors(parseGroupRegistration(form({ ...base, session }))), session).toEqual({ session: "required" });
  });
});

describe("individual request", () => {
  test("accepts a request with the preferred period; payment is agreed later, not chosen", () => {
    const r = parseIndividual(form({ ...base, period: "Detsembri teine pool" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).not.toHaveProperty("paymentChoice");
    const { payment: _payment, ...noPayment } = base;
    void _payment;
    expect(parseIndividual(form({ ...noPayment, period: "12.12" })).ok).toBe(true);
  });
  test("the preferred period is required, the message is limited", () => {
    expect(errors(parseIndividual(form({ ...base, message: "x".repeat(2001) })))).toEqual({ period: "required", message: "required" });
  });
});

describe("contact, newsletter, cart, practice, waitlist", () => {
  test("contact: name, e-mail and message", () => {
    expect(parseContact(form({ name: "Test", email: "test@example.com", message: "Tere!\nKüsimus.", locale: "ru" }))).toEqual({
      ok: true,
      data: { name: "Test", email: "test@example.com", message: "Tere!\nKüsimus.", locale: "ru" },
    });
    expect(errors(parseContact(form({ name: " ", email: "x@", message: "" })))).toEqual({ name: "required", email: "invalid", message: "required" });
    expect(errors(parseContact(form({ name: "x".repeat(121), email: "a@example.ee", message: "x".repeat(2001) })))).toEqual({ name: "required", message: "required" });
  });
  test("newsletter: e-mail and consent", () => {
    expect(parseSubscribe(form({ email: "a@example.ee", consent: "on" }))).toEqual({ ok: true, data: { email: "a@example.ee", consent: "on", locale: "et" } });
    expect(errors(parseSubscribe(form({ email: "nope" })))).toEqual({ email: "invalid", consent: "required" });
  });
  test("cart interest: e-mail and course", () => {
    expect(parsePurchaseInterest(form({ course: "kulmumeistri-e-koolitus", email: "test@example.com" })).ok).toBe(true);
    expect(errors(parsePurchaseInterest(form({ course: "", email: "x" })))).toEqual({ email: "invalid", form: "invalid" });
  });
  test("practice: package, contact details and preferred times; the completed course is optional", () => {
    const practice = { package: "MINI", name: "Test Õpilane", email: "test@example.com", phone: "+372 5555 5555", times: "Tööpäeva õhtud", locale: "et" };
    expect(parsePractice(form(practice))).toEqual({ ok: true, data: { ...practice, course: "" } });
    expect(parsePractice(form({ ...practice, course: "Kulmumeistri baaskoolitus" })).ok).toBe(true);
    expect(errors(parsePractice(form({ email: "x", course: "y".repeat(201) })))).toEqual({
      package: "required",
      name: "required",
      email: "invalid",
      phone: "required",
      course: "required",
      times: "required",
    });
    expect(errors(parsePractice(form({ ...practice, package: "<script>" })))).toEqual({ package: "required" });
  });
  test("waitlist: name, e-mail and the session", () => {
    expect(parseWaitlist(form({ session: "12", name: "Test", email: "test@example.com" }))).toEqual({
      ok: true,
      data: { session: 12, name: "Test", email: "test@example.com", locale: "et" },
    });
    expect(errors(parseWaitlist(form({ session: "abc", name: "", email: "nope" })))).toEqual({ form: "invalid", name: "required", email: "invalid" });
  });
});

describe("normalisation", () => {
  test("e-mail is trimmed and lowercased; one-line fields collapse whitespace (they go into e-mail subjects)", () => {
    const r = parseWaitlist(form({ session: "1", name: "  Mari \n\t Maasikas ", email: "  Mari.Maasikas+Kursus@Example.COM " }));
    expect(r.ok && r.data).toMatchObject({ name: "Mari Maasikas", email: "mari.maasikas+kursus@example.com" });
  });
  test("an unknown locale falls back to Estonian", () => {
    const r = parseContact(form({ name: "A", email: "a@example.ee", message: "m", locale: "de" }));
    expect(r.ok && r.data.locale).toBe("et");
  });
  test("checkboxes: only 'on' ticks", () => {
    const r = parseGroupRegistration(form({ ...base, session: "1", modelHelp: "on", account: "" }));
    expect(r.ok && [r.data.wantsModelHelp, r.data.wantsAccount]).toEqual([true, false]);
  });
});

test("honeypot: anything in `website` is spam", () => {
  expect(isSpam(form({ website: "" }))).toBe(false);
  expect(isSpam(form({}))).toBe(false);
  expect(isSpam(form({ website: "http://spam.example" }))).toBe(true);
});
