import { describe, expect, test } from "vitest";
import { registerContact, submitIndividual, submitPractice, submitPurchaseInterest, submitWaitlist } from "@/server/actions/public";

// Task 8 placeholders: validation only (Task 10 adds storage, notifications and rate limits).

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const base = { course: "kulmumeistri-baaskoolitus", name: "Test Õpilane", email: "test@example.com", phone: "+372 5555 5555", payment: "half", terms: "on", locale: "et" };

describe("registerContact (group)", () => {
  test("accepts a complete registration", async () => {
    expect(await registerContact(form({ ...base, session: "12", modelHelp: "on" }))).toEqual({ ok: true });
  });
  test("needs a session, contact details, a payment choice and the terms", async () => {
    const r = await registerContact(form({ course: "x", email: "nope", phone: "abc", payment: "all" }));
    expect(r).toEqual({ ok: false, errors: { session: "required", name: "required", email: "invalid", phone: "required", payment: "required", terms: "required" } });
  });
  test("phone is required", async () => {
    expect(await registerContact(form({ ...base, session: "3", phone: "" }))).toEqual({ ok: false, errors: { phone: "required" } });
  });
  test("a course slug is required", async () => {
    expect(await registerContact(form({ ...base, course: "", session: "1" }))).toEqual({ ok: false, errors: { form: "invalid" } });
  });
});

describe("submitIndividual", () => {
  test("accepts a request with the preferred period; payment is agreed later, not chosen", async () => {
    expect(await submitIndividual(form({ ...base, period: "Detsembri teine pool" }))).toEqual({ ok: true });
    const { payment: _payment, ...noPayment } = base;
    void _payment;
    expect(await submitIndividual(form({ ...noPayment, period: "12.12" }))).toEqual({ ok: true });
  });
  test("the preferred period is required, the message is limited", async () => {
    expect(await submitIndividual(form({ ...base, message: "x".repeat(2001) }))).toEqual({ ok: false, errors: { period: "required", message: "required" } });
  });
});

describe("submitPurchaseInterest", () => {
  test("e-mail and course", async () => {
    expect(await submitPurchaseInterest(form({ course: "kulmumeistri-e-koolitus", email: "test@example.com" }))).toEqual({ ok: true });
    expect(await submitPurchaseInterest(form({ course: "", email: "x" }))).toEqual({ ok: false, errors: { email: "invalid", form: "invalid" } });
  });
});

describe("submitPractice", () => {
  const practice = { package: "MINI", name: "Test Õpilane", email: "test@example.com", phone: "+372 5555 5555", times: "Tööpäeva õhtud", locale: "et" };
  test("accepts a complete request; the completed course is optional", async () => {
    expect(await submitPractice(form(practice))).toEqual({ ok: true });
    expect(await submitPractice(form({ ...practice, course: "Kulmumeistri baaskoolitus" }))).toEqual({ ok: true });
  });
  test("needs a package, contact details and preferred times", async () => {
    expect(await submitPractice(form({ email: "x", course: "y".repeat(201) }))).toEqual({
      ok: false,
      errors: { package: "required", name: "required", email: "invalid", phone: "required", course: "required", times: "required" },
    });
    expect(await submitPractice(form({ ...practice, package: "<script>" }))).toEqual({ ok: false, errors: { package: "required" } });
  });
});

describe("submitWaitlist", () => {
  test("name, e-mail and the session", async () => {
    expect(await submitWaitlist(form({ session: "12", name: "Test", email: "test@example.com" }))).toEqual({ ok: true });
    expect(await submitWaitlist(form({ session: "abc", name: "", email: "nope" }))).toEqual({ ok: false, errors: { form: "invalid", name: "required", email: "invalid" } });
  });
});
