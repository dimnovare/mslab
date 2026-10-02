import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { courses, courseSessions, practicePackages, registrations, requests, subscribers } from "@/db/schema";
import type { Env } from "@/server/notify";
import {
  confirmSubscriber,
  createRegistration,
  handleContact,
  handleIndividual,
  handlePractice,
  handlePurchaseInterest,
  handleRegistration,
  handleSubscribe,
  handleWaitlist,
  runSubmission,
  type Deps,
} from "@/server/submit";
import { fakeKv, stubFetch, type FetchCall } from "../fakes";
import { getCourseBySlug, listUpcomingSessions } from "@/db/queries/public";
import { upcomingFrom } from "@/domain/calendar";

// Form submissions end to end without Next.js: PGlite database, in-memory KV, stubbed fetch for Resend and Telegram.

const NOW = new Date("2026-10-01T10:00:00Z");
const text = { level: "basic" as const, summary: { et: "" }, body: { et: "" } };

let db: Db;
let c: { id: number };
let s: { id: number };
const ids = { other: 0, full: 0, cancelled: 0, past: 0, thisMorning: 0, yesterday: 0, otherCourse: 0, unpublished: 0, groupless: 0 };

beforeAll(async () => {
  db = await makeTestDb();
  [c] = await db
    .insert(courses)
    .values({ ...text, slug: "kulmud", type: "contact", title: { et: "Kulmude baaskoolitus" }, published: true, priceGroup: 39000, priceIndividual: 45000 })
    .returning();
  const [other] = await db
    .insert(courses)
    .values({ ...text, slug: "ripsmed", type: "contact", title: { et: "Ripsmed" }, published: true, priceGroup: 30000 })
    .returning();
  const [unpublished] = await db.insert(courses).values({ ...text, slug: "mustand", type: "contact", title: { et: "Mustand" }, priceGroup: 1 }).returning();
  const [groupless] = await db
    .insert(courses)
    .values({ ...text, slug: "ainult-individuaal", type: "contact", title: { et: "Individuaal" }, published: true, priceIndividual: 1 })
    .returning();
  await db.insert(courses).values({ ...text, slug: "e-kulmud", type: "e_learning", title: { et: "Kulmude e-koolitus" }, published: true, price: 19000 });
  const session = (courseId: number, startsAt: string, extra: Partial<typeof courseSessions.$inferInsert> = {}) =>
    db.insert(courseSessions).values({ courseId, startsAt: new Date(startsAt), city: "Pärnu", venue: "MS LAB stuudio", capacity: 4, ...extra }).returning();
  [s] = await session(c.id, "2026-11-14T08:00:00Z");
  ids.other = (await session(c.id, "2026-12-05T08:00:00Z", { city: "Tartu", venue: "" }))[0].id;
  ids.full = (await session(c.id, "2026-12-12T08:00:00Z", { capacity: 1 }))[0].id;
  ids.cancelled = (await session(c.id, "2026-12-19T08:00:00Z", { status: "cancelled" }))[0].id;
  ids.past = (await session(c.id, "2026-09-01T08:00:00Z"))[0].id;
  // NOW is 13:00 on 1.10 in Tallinn: one session began this morning, one yesterday (item 10: "today" is the Estonian date)
  ids.thisMorning = (await session(c.id, "2026-10-01T07:00:00Z", { city: "Hommik" }))[0].id;
  ids.yesterday = (await session(c.id, "2026-09-30T07:00:00Z", { city: "Eile" }))[0].id;
  ids.otherCourse = (await session(other.id, "2026-11-20T08:00:00Z"))[0].id;
  ids.unpublished = unpublished.id;
  ids.groupless = groupless.id;
  // One confirmed registration fills the one-seat session.
  await db.insert(registrations).values({ courseId: c.id, courseSessionId: ids.full, kind: "group", name: "X", email: "x@example.com", paymentChoice: "full", status: "confirmed" });
  await db.insert(practicePackages).values({ code: "MINI", name: { et: "MINI" }, tagline: { et: "" }, models: 2, durationLabel: { et: "4 ak" }, price: 15000 });
});

beforeEach(async () => {
  await db.delete(requests);
  await db.delete(subscribers);
  await db.delete(registrations).where(eq(registrations.email, "test@example.com"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SECRETS = { RESEND_API_KEY: "re_test", TELEGRAM_BOT_TOKEN: "123:abc" };

/** Dependencies with a fresh KV; `flush()` awaits the notification work that production runs after the response. */
function setup(opts: { secrets?: boolean; ip?: string; kv?: ReturnType<typeof fakeKv> } = {}) {
  const kv = opts.kv ?? fakeKv({ "tg:chat": "42" });
  const env: Env = { KV: kv, MAIL_FROM: "MS LAB <info@send.example>", MARIA_EMAIL: "maria@example.com", SITE_URL: "https://mslab.example", ...(opts.secrets ? SECRETS : {}) };
  const tasks: (() => Promise<unknown>)[] = [];
  const deps: Deps = { db, env, ip: opts.ip ?? "203.0.113.1", siteUrl: "https://mslab.example", now: NOW, later: (task) => void tasks.push(task) };
  return { deps, kv, flush: () => Promise.all(tasks.splice(0).map((task) => task())) };
}

/** Resend and Telegram stubs; quiet console. */
function outbox() {
  vi.spyOn(console, "info").mockImplementation(() => {});
  const f = stubFetch((url) => (url.includes("resend") ? Response.json({ id: "email_1" }) : Response.json({ ok: true })));
  const mails = () => f.calls.filter((x) => x.url.includes("resend")).map((x) => x.body as { to: string; subject: string; text: string; reply_to?: string });
  const pings = () => f.calls.filter((x: FetchCall) => x.url.includes("telegram")).map((x) => (x.body as { text: string }).text);
  return { mails, pings };
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const group = (extra: Record<string, string> = {}) =>
  form({ course: "kulmud", session: String(s.id), name: "Test  Õpilane", email: " Test@Example.com ", phone: "+372 5555 5555", payment: "half", modelHelp: "on", terms: "on", locale: "ru", ...extra });

test("createRegistration never confirms", async () => {
  const r = await createRegistration(db, { courseId: c.id, courseSessionId: s.id, kind: "group", name: "A", email: "a@b.ee", phone: "1", paymentChoice: "full", wantsModelHelp: true, wantsAccount: false, preferredPeriod: "", message: "", locale: "et" });
  expect(r.status).toBe("awaiting_prepayment");
  expect(r.paidCents).toBe(0);
  await db.delete(registrations).where(eq(registrations.id, r.id));
});

test("createRegistration stores the e-mail trimmed and lowercased", async () => {
  const r = await createRegistration(db, { courseId: c.id, courseSessionId: s.id, kind: "group", name: "A", email: "  A@B.EE ", phone: "1", paymentChoice: "full", wantsModelHelp: false, wantsAccount: false, preferredPeriod: "", message: "", locale: "et" });
  expect(r.email).toBe("a@b.ee");
  await db.delete(registrations).where(eq(registrations.id, r.id));
});

describe("group registration", () => {
  test("is stored awaiting prepayment, then Maria gets the summary by e-mail and Telegram", async () => {
    const { mails, pings } = outbox();
    const { deps, flush } = setup({ secrets: true });
    expect(await handleRegistration(deps, group())).toEqual({ ok: true });
    const rows = await db.select().from(registrations).where(eq(registrations.email, "test@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      courseId: c.id,
      courseSessionId: s.id,
      kind: "group",
      name: "Test Õpilane",
      phone: "+372 5555 5555",
      paymentChoice: "half",
      wantsModelHelp: true,
      wantsAccount: false,
      locale: "ru",
      status: "awaiting_prepayment",
      paidCents: 0,
    });
    expect(mails()).toHaveLength(0); // notifications run after the response
    await flush();
    const [mail] = mails();
    expect(mail.to).toBe("maria@example.com");
    expect(mail.reply_to).toBe("test@example.com");
    expect(mail.subject).toBe("Registreerimine: Kulmude baaskoolitus, 14.11.2026 kell 10:00, Pärnu — Test Õpilane");
    for (const line of [
      "Koolitus: Kulmude baaskoolitus",
      "Kuupäev: 14.11.2026 kell 10:00",
      "Koht: Pärnu, MS LAB stuudio",
      "Nimi: Test Õpilane",
      "E-post: test@example.com",
      "Telefon: +372 5555 5555",
      "Suhtluskeel: vene",
      "Tasumine: 50% registreerimisel + 50% koolituspäeval",
      "Abi modellide leidmisel: jah",
      "Loo konto: ei",
      "Staatus: ootab ettemaksu. Koht kinnitub alles pärast vähemalt 50% ettemaksu laekumist.",
      "Admin: https://mslab.example/admin",
    ])
      expect(mail.text).toContain(line);
    const [ping] = pings();
    expect(ping).toContain("Uus registreerimine (grupikoolitus)");
    expect(ping).toContain("Test Õpilane · test@example.com · +372 5555 5555");
    expect(ping.endsWith("https://mslab.example/admin")).toBe(true);
  });

  test("a date that filled up meanwhile is a session error; nothing is stored", async () => {
    const { deps } = setup();
    expect(await handleRegistration(deps, group({ session: String(ids.full) }))).toEqual({ ok: false, errors: { session: "full" } });
    for (const id of [ids.cancelled, ids.past, ids.otherCourse, 999999])
      expect(await handleRegistration(deps, group({ session: String(id) })), String(id)).toEqual({ ok: false, errors: { session: "unavailable" } });
    expect(await db.select().from(registrations).where(eq(registrations.email, "test@example.com"))).toHaveLength(0);
  });

  test("a session that began earlier today can still be booked, as the calendar and the course page still list it (item 10)", async () => {
    const { deps } = setup();
    expect(await handleRegistration(deps, group({ session: String(ids.thisMorning) }))).toEqual({ ok: true });
    expect(await db.select().from(registrations).where(eq(registrations.email, "test@example.com"))).toHaveLength(1);
    const listed = await getCourseBySlug(db, "kulmud", { sessionsFrom: upcomingFrom(NOW) });
    expect(listed?.sessions.map((x) => x.id)).toContain(ids.thisMorning);
    expect(listed?.sessions.map((x) => x.id)).not.toContain(ids.yesterday);
    expect((await listUpcomingSessions(db, upcomingFrom(NOW))).map((x) => x.id)).toContain(ids.thisMorning);
    // yesterday's is gone everywhere, booking included
    expect(await handleRegistration(setup().deps, group({ session: String(ids.yesterday) }))).toEqual({ ok: false, errors: { session: "unavailable" } });
  });

  test("only published contact courses with a group price", async () => {
    const { deps } = setup();
    for (const course of ["mustand", "ainult-individuaal", "e-kulmud", "ei-ole"])
      expect(await handleRegistration(deps, group({ course })), course).toEqual({ ok: false, errors: { form: "invalid" } });
  });

  test("without secrets (local dev) it is stored and the notification is skipped", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const f = stubFetch();
    const { deps, flush } = setup();
    expect(await handleRegistration(deps, group({ session: String(ids.other) }))).toEqual({ ok: true });
    await flush();
    expect(f.calls).toHaveLength(0);
    expect(info).toHaveBeenCalledWith("[notify] RESEND_API_KEY is not set: e-mail skipped");
    expect(await db.select().from(registrations).where(eq(registrations.email, "test@example.com"))).toHaveLength(1);
  });

  test("a failing notification never fails the stored submission", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    stubFetch(() => {
      throw new Error("offline");
    });
    const { deps, flush } = setup({ secrets: true });
    expect(await handleRegistration(deps, group())).toEqual({ ok: true });
    await expect(flush()).resolves.toBeDefined();
    expect(await db.select().from(registrations).where(eq(registrations.email, "test@example.com"))).toHaveLength(1);
  });
});

describe("honeypot and rate limit", () => {
  test("a filled honeypot pretends success and stores nothing (and does not count)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps, kv } = setup();
    expect(await handleContact(deps, form({ name: "Bot", email: "bot@example.com", message: "spam", website: "x" }))).toEqual({ ok: true });
    expect(await db.select().from(requests)).toHaveLength(0);
    expect([...kv.store.keys()].filter((k) => k.startsWith("rl:"))).toEqual([]);
  });

  test("5 submissions per form and IP in 10 minutes; the 6th gets form 'rate'", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps, kv } = setup({ ip: "198.51.100.9" });
    const msg = form({ name: "A", email: "a@example.com", message: "Tere" });
    for (let i = 0; i < 5; i++) expect(await handleContact(deps, msg)).toEqual({ ok: true });
    expect(await handleContact(deps, msg)).toEqual({ ok: false, errors: { form: "rate" } });
    expect(await db.select().from(requests)).toHaveLength(5);
    expect(kv.ttl.get("rl:contact:198.51.100.9")).toBe(600);
    // Another form and another visitor are counted separately.
    expect(await handlePractice(deps, form({ package: "MINI", name: "A", email: "a@example.com", phone: "+372 5555 5555", times: "õhtuti" }))).toEqual({ ok: true });
    expect(await handleContact({ ...deps, ip: "198.51.100.10" }, msg)).toEqual({ ok: true });
  });

  test("a request without a visitor address is not rate limited (no shared bucket); logged once", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, kv } = setup();
    const msg = form({ name: "A", email: "a@example.com", message: "Tere" });
    for (let i = 0; i < 7; i++) expect(await handleContact({ ...deps, ip: null }, msg)).toEqual({ ok: true });
    expect([...kv.store.keys()].filter((k) => k.startsWith("rl:"))).toEqual([]);
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/\d+\.\d+\.\d+/);
  });

  test("invalid submissions are not counted", async () => {
    const { deps, kv } = setup();
    for (let i = 0; i < 7; i++) expect((await handleContact(deps, form({ name: "", email: "x", message: "" }))).ok).toBe(false);
    expect(kv.store.size).toBe(1); // only tg:chat
  });

  test("when KV fails the submission still goes through (fail open)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const kv = fakeKv();
    kv.get = async () => {
      throw new Error("KV down");
    };
    const { deps } = setup({ kv });
    expect(await handleContact(deps, form({ name: "A", email: "a@example.com", message: "Tere" }))).toEqual({ ok: true });
    expect(await db.select().from(requests)).toHaveLength(1);
  });
});

describe("requests", () => {
  test("individual course: kind individual with the preferred period, no payment choice", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    const r = await handleIndividual(deps, form({ course: "kulmud", name: "Test", email: "TEST@example.com", phone: "+372 5555 5555", period: "Detsembri teine pool", message: "Mul on küsimus.\nTeine rida.", account: "on", terms: "on" }));
    expect(r).toEqual({ ok: true });
    const [row] = await db.select().from(requests);
    expect(row.kind).toBe("individual");
    expect(row.handled).toBe(false);
    expect(row.payload).toEqual({
      course: "kulmud",
      courseId: c.id,
      name: "Test",
      email: "test@example.com",
      phone: "+372 5555 5555",
      preferredPeriod: "Detsembri teine pool",
      message: "Mul on küsimus.\nTeine rida.",
      wantsModelHelp: false,
      wantsAccount: true,
      locale: "et",
    });
    expect(await db.select().from(registrations).where(eq(registrations.email, "test@example.com"))).toHaveLength(0);
    await flush();
    expect(mails()[0].subject).toBe("Individuaalkoolituse päring: Kulmude baaskoolitus — Test");
    expect(mails()[0].text).toContain("Soovitud periood või kuupäev: Detsembri teine pool");
    expect(mails()[0].text).toContain("Sõnum:\nMul on küsimus.\nTeine rida.");
    // A course without an individual price does not take requests.
    expect(await handleIndividual(deps, form({ course: "ripsmed", name: "T", email: "t@example.com", phone: "+372 5555 5555", period: "x", terms: "on" }))).toEqual({ ok: false, errors: { form: "invalid" } });
  });

  test("contact message", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    expect(await handleContact(deps, form({ name: "Mari", email: "mari@example.com", message: "Tere!", locale: "ru" }))).toEqual({ ok: true });
    const [row] = await db.select().from(requests);
    expect(row).toMatchObject({ kind: "contact", payload: { name: "Mari", email: "mari@example.com", message: "Tere!", locale: "ru" } });
    await flush();
    expect(mails()[0]).toMatchObject({ subject: "Sõnum kodulehelt — Mari", reply_to: "mari@example.com" });
  });

  test("purchase interest: a contact request { course, intent: purchase, email } for a published e-course", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps } = setup();
    expect(await handlePurchaseInterest(deps, form({ course: "e-kulmud", email: "Ostja@Example.com" }))).toEqual({ ok: true });
    const [row] = await db.select().from(requests);
    expect(row).toMatchObject({ kind: "contact", payload: { course: "e-kulmud", intent: "purchase", email: "ostja@example.com", locale: "et" } });
    expect(await handlePurchaseInterest(deps, form({ course: "kulmud", email: "a@example.com" }))).toEqual({ ok: false, errors: { form: "invalid" } });
  });

  test("practice request for a known package", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps } = setup();
    const fields = { package: "MINI", name: "Test", email: "test@example.com", phone: "+372 5555 5555", course: "Kulmud", times: "Tööpäeva õhtud" };
    expect(await handlePractice(deps, form(fields))).toEqual({ ok: true });
    const [row] = await db.select().from(requests);
    expect(row).toMatchObject({ kind: "practice", payload: { ...fields, locale: "et" } });
    expect(await handlePractice(deps, form({ ...fields, package: "MAXI" }))).toEqual({ ok: false, errors: { package: "required" } });
  });

  test("waitlist for a scheduled session of a published course", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    expect(await handleWaitlist(deps, form({ session: String(ids.full), name: "Test", email: "test@example.com" }))).toEqual({ ok: true });
    const [row] = await db.select().from(requests);
    expect(row).toMatchObject({ kind: "waitlist", payload: { session: ids.full, course: "kulmud", name: "Test", email: "test@example.com", locale: "et" } });
    await flush();
    expect(mails()[0].subject).toBe("Ootenimekiri: Kulmude baaskoolitus, 12.12.2026 kell 10:00, Pärnu — Test");
    for (const session of [ids.cancelled, 999999])
      expect(await handleWaitlist(deps, form({ session: String(session), name: "T", email: "t@example.com" }))).toEqual({ ok: false, errors: { form: "invalid" } });
  });
});

describe("failures are logged without personal data", () => {
  test("a failing insert answers form 'server' and logs the error class and SQLSTATE, never field values", async () => {
    const broken = await makeTestDb();
    await broken.execute(sql`drop table requests`);
    const fields = { name: "Mari Maasikas", email: "mari.secret@example.com", message: "Salajane sõnum 5551234", locale: "et" };
    // Sanity: the driver error message does carry the parameters, so this test would catch them being logged.
    const direct = await broken.insert(requests).values({ kind: "contact", payload: fields }).catch((e: unknown) => e);
    expect(String((direct as Error).message)).toContain("mari.secret@example.com");

    const logs = (["error", "warn", "info", "log"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { deps } = setup();
    const result = await runSubmission("contact", () => ({ ...deps, db: broken }), handleContact, form(fields));
    expect(result).toEqual({ ok: false, errors: { form: "server" } });
    const logged = logs.flatMap((spy) => spy.mock.calls.flat()).map(String).join("\n");
    expect(logged).toContain("[forms] contact: not stored: DrizzleQueryError (code 42P01)");
    for (const value of ["Mari", "Maasikas", "mari.secret", "Salajane", "5551234", "insert into"]) expect(logged).not.toContain(value);
  });

  test("a failure while building the dependencies is answered the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runSubmission("contact", () => {
      throw new Error("no Cloudflare context: mari@example.com");
    }, handleContact, form({}));
    expect(result).toEqual({ ok: false, errors: { form: "server" } });
  });
});

describe("newsletter double opt-in", () => {
  const signUp = (deps: Deps, email = "uus@example.com", locale = "et") => handleSubscribe(deps, form({ email, consent: "on", locale }));

  test("a new address is stored unconfirmed and gets the confirmation link in its language", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    expect(await signUp(deps, " Uus@Example.com ", "ru")).toEqual({ ok: true });
    const [sub] = await db.select().from(subscribers);
    expect(sub).toMatchObject({ email: "uus@example.com", locale: "ru", confirmedAt: null });
    expect(sub.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sub.consentAt).toEqual(NOW);
    await flush();
    const [mail] = mails();
    expect(mail.to).toBe("uus@example.com");
    expect(mail.subject).toBe("Подтвердите подписку на рассылку MS LAB");
    expect(mail.text).toContain(`https://mslab.example/api/newsletter/confirm?t=${sub.token}`);
    // The link base is the allow-listed request origin the action resolved (deps.siteUrl), not always SITE_URL.
    await signUp({ ...deps, siteUrl: "https://mslab-web.dim-novare.workers.dev" }, "teine@example.com");
    await flush();
    expect(mails()[1].text).toContain("https://mslab-web.dim-novare.workers.dev/api/newsletter/confirm?t=");
  });

  test("signing up again does not tell whether the address exists: same answer, one row; unconfirmed → link again", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    await signUp(deps);
    expect(await signUp({ ...deps, now: new Date("2026-10-02T00:00:00Z") }, "UUS@example.com")).toEqual({ ok: true });
    const rows = await db.select().from(subscribers);
    expect(rows).toHaveLength(1);
    expect(rows[0].consentAt).toEqual(new Date("2026-10-02T00:00:00Z"));
    await flush();
    expect(mails().map((m) => m.subject)).toEqual(["Kinnita MS LABi uudiskirjaga liitumine", "Kinnita MS LABi uudiskirjaga liitumine"]);
    expect(mails()[1].text).toContain(rows[0].token);
  });

  test("a confirmed address gets the same answer and no e-mail", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    await signUp(deps);
    const [sub] = await db.select().from(subscribers);
    await confirmSubscriber(db, sub.token, NOW);
    expect(await signUp(deps)).toEqual({ ok: true });
    await flush();
    expect(mails()).toHaveLength(1);
  });

  test("at most 3 confirmation e-mails per address and day, whatever the IP", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    for (let i = 0; i < 5; i++) expect(await signUp({ ...deps, ip: `10.0.0.${i}` })).toEqual({ ok: true });
    await flush();
    expect(mails()).toHaveLength(3);
  });

  test("confirmSubscriber sets confirmedAt once; unknown or malformed tokens are null", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps } = setup();
    await signUp(deps);
    const [sub] = await db.select().from(subscribers);
    const first = await confirmSubscriber(db, sub.token, new Date("2026-10-03T00:00:00Z"));
    expect(first?.confirmedAt).toEqual(new Date("2026-10-03T00:00:00Z"));
    const again = await confirmSubscriber(db, sub.token, new Date("2026-10-04T00:00:00Z"));
    expect(again?.confirmedAt).toEqual(new Date("2026-10-03T00:00:00Z"));
    expect(await confirmSubscriber(db, "x".repeat(43), NOW)).toBeNull();
    expect(await confirmSubscriber(db, "", NOW)).toBeNull();
    expect(await confirmSubscriber(db, "' or 1=1 --", NOW)).toBeNull();
  });
});
