import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/db/client";
import {
  clientFavourites, clients, clientSessions, courseAccess, courses, courseSessions, pages, practicePackages, registrations, requests, settings,
  subscribers, termsAcceptances,
} from "@/db/schema";
import { nextStep } from "@/domain/account-cards";
import {
  acceptTerms, courseTermsVersion, createChangeRequest, deleteClient, favouriteSlugs, loadDashboard, loadEcourse, mergeFavourites, parsePrepayment,
  setFavourite, setNewsletter, updateProfile,
} from "@/server/client-data";
import { makeTestDb } from "./helpers";

// What a client sees and may change (server/client-data.ts) against a real (PGlite) database. Every address is `@example.test`.

const NOW = new Date("2026-10-03T10:00:00Z");
const day = 86_400_000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * day);

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});

const TABLES = [termsAcceptances, clientFavourites, courseAccess, clientSessions, registrations, requests, subscribers, clients, courseSessions, courses, settings, pages, practicePackages] as const;

type Fixtures = Awaited<ReturnType<typeof seed>>;
let f: Fixtures;

const base = { level: "basic" as const, summary: { et: "" }, body: { et: "" } };

/** Courses: a published contact course (group 350 €, individual 450 €), a draft contact course, two e-courses (one a draft), and their sessions. */
async function seed() {
  const [lami] = await db.insert(courses).values({
    ...base, slug: "kulmude-lami", type: "contact", title: { et: "Kulmude lamineerimine", ru: "Ламинирование бровей" }, published: true, priceGroup: 35000, priceIndividual: 45000,
  }).returning();
  const [draft] = await db.insert(courses).values({ ...base, slug: "ootel", type: "contact", title: { et: "Veel peidus" }, published: false, priceGroup: 10000 }).returning();
  const [online] = await db.insert(courses).values({
    ...base, slug: "veebikursus", type: "e_learning", title: { et: "Veebikursus" }, published: true, price: 9500, accessMonths: 6,
    modules: [{ et: "Sissejuhatus" }, { et: "Praktika", ru: "Практика" }],
  }).returning();
  const [hiddenOnline] = await db.insert(courses).values({ ...base, slug: "peidus-kursus", type: "e_learning", title: { et: "Peidus kursus" }, published: false, price: 5000 }).returning();
  const session = async (courseId: number, startsAt: Date, over: Partial<typeof courseSessions.$inferInsert> = {}) =>
    (await db.insert(courseSessions).values({ courseId, startsAt, city: "Pärnu", venue: "Salong", ...over }).returning())[0];
  return {
    lami, draft, online, hiddenOnline,
    soon: await session(lami.id, at(30)),
    later: await session(lami.id, at(60), { city: "Tartu" }),
    mid: await session(lami.id, at(50)),
    past: await session(lami.id, at(-20)),
    called: await session(lami.id, at(45), { status: "cancelled" }),
    draftSession: await session(draft.id, at(40)),
  };
}

beforeEach(async () => {
  for (const table of TABLES) await db.delete(table);
  f = await seed();
});

async function client(email = "kati@example.test", over: Partial<typeof clients.$inferInsert> = {}) {
  return (await db.insert(clients).values({ email, ...over }).returning())[0];
}

type RegOver = Partial<typeof registrations.$inferInsert>;
async function register(clientId: number | null, courseId: number, courseSessionId: number | null, over: RegOver = {}) {
  return (await db.insert(registrations).values({
    courseId, courseSessionId, kind: "group", name: "Kati Tamm", email: "kati@example.test", phone: "+3725551234", paymentChoice: "full", clientId, ...over,
  }).returning())[0];
}

async function request(clientId: number | null, kind: typeof requests.$inferInsert["kind"], payload: Record<string, string | number | boolean>, over: Partial<typeof requests.$inferInsert> = {}) {
  return (await db.insert(requests).values({ kind, payload, clientId, ...over }).returning())[0];
}

const grant = async (clientId: number, courseId: number, over: Partial<typeof courseAccess.$inferInsert> = {}) =>
  (await db.insert(courseAccess).values({ clientId, courseId, grantedBy: "admin@example.test", grantedAt: at(-10), expiresAt: at(170), ...over }).returning())[0];

const setting = (key: string, value: unknown) => db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });

describe("loadDashboard", () => {
  test("lists the client's registrations, requests (waitlist included) and e-course access; newest session first, over cards last", async () => {
    const kati = await client();
    const soon = await register(kati.id, f.lami.id, f.soon.id, { status: "confirmed", paidCents: 17500, paymentChoice: "half" });
    const later = await register(kati.id, f.lami.id, f.later.id);
    const past = await register(kati.id, f.lami.id, f.past.id, { status: "confirmed", paidCents: 35000 });
    const cancelled = await register(kati.id, f.lami.id, f.later.id, { status: "cancelled" });
    const individual = await register(kati.id, f.lami.id, null, { kind: "individual", preferredPeriod: "novembri lõpp", createdAt: at(-1) });
    await db.insert(practicePackages).values({ code: "MINI", name: { et: "Mini pakett", ru: "Мини пакет" }, tagline: { et: "" }, models: 2, durationLabel: { et: "2 h" }, price: 5000 });
    const practice = await request(kati.id, "practice", { package: "MINI", course: "kulmude-lami", times: "E ja K õhtuti", email: "kati@example.test" }, { createdAt: at(-3) });
    const wait = await request(kati.id, "waitlist", { session: f.mid.id, course: "kulmude-lami", email: "kati@example.test" }, { createdAt: at(-2) });
    const individualRequest = await request(kati.id, "individual", { course: "kulmude-lami", preferredPeriod: "jaanuar", message: "ei kuulu kaardile", email: "kati@example.test" }, { createdAt: at(-1), handled: true });
    await grant(kati.id, f.online.id);

    const dash = (await loadDashboard(db, kati.id, NOW))!;
    expect(dash.client).toEqual({ email: "kati@example.test", name: "", phone: "", locale: "et", newsletter: false });
    expect(dash.favourites).toEqual([]);
    expect(dash.prepayment).toBeNull();

    // open ones by their date, the newest first: a session's start, else when the request was made or the access granted
    const order = dash.cards.map((c) => (c.kind === "contact" || c.kind === "individual" ? `reg${c.registrationId}` : c.kind === "ecourse" ? `course:${c.course.slug}` : `req${c.requestId}`));
    expect(order).toEqual([
      `reg${later.id}`, // session in 60 days
      `req${wait.id}`, // waitlist for the session in 50 days
      `reg${soon.id}`, // session in 30 days
      `reg${individual.id}`, // made yesterday
      `req${practice.id}`, // made 3 days ago
      `course:veebikursus`, // granted 10 days ago
      // over: the cancelled registration (its session is in 60 days), the handled request (yesterday), the past session
      `reg${cancelled.id}`,
      `req${individualRequest.id}`,
      `reg${past.id}`,
    ]);
  });

  test("a contact registration card carries its course, session, status, payment and the price it is measured by", async () => {
    const kati = await client();
    const reg = await register(kati.id, f.lami.id, f.soon.id, { status: "confirmed", paidCents: 17500, paymentChoice: "half" });
    const { cards } = (await loadDashboard(db, kati.id, NOW))!;
    expect(cards).toEqual([
      {
        kind: "contact", registrationId: reg.id, course: { slug: "kulmude-lami", title: { et: "Kulmude lamineerimine", ru: "Ламинирование бровей" } },
        session: { startsAt: f.soon.startsAt.toISOString(), city: "Pärnu", venue: "Salong", cancelled: false },
        status: "confirmed", paymentChoice: "half", priceCents: 35000, paidCents: 17500, createdAt: reg.createdAt.toISOString(),
      },
    ]);
    // the cards feed nextStep as they are (they are the JSON the endpoint sends)
    expect(nextStep(cards[0], NOW, null).key).toBe("confirmedRest");
  });

  test("an individual-kind registration with a session is measured by the individual price; a called-off session is marked", async () => {
    const kati = await client();
    await register(kati.id, f.lami.id, f.soon.id, { kind: "individual" });
    await register(kati.id, f.lami.id, f.called.id, { status: "confirmed" });
    const { cards } = (await loadDashboard(db, kati.id, NOW))!;
    const byDate = Object.fromEntries(cards.map((c) => [c.kind === "contact" ? c.session.startsAt : "", c]));
    expect(byDate[f.soon.startsAt.toISOString()]).toMatchObject({ priceCents: 45000 });
    expect(byDate[f.called.startsAt.toISOString()]).toMatchObject({ session: { cancelled: true } });
    expect(nextStep(byDate[f.called.startsAt.toISOString()], NOW, null).key).toBe("cancelled");
  });

  test("a registration without a session is an individual card; one for a course that is not published still shows", async () => {
    const kati = await client();
    const reg = await register(kati.id, f.lami.id, null, { kind: "individual", preferredPeriod: "jaanuar" });
    const draftReg = await register(kati.id, f.draft.id, f.draftSession.id);
    const { cards } = (await loadDashboard(db, kati.id, NOW))!;
    expect(cards.find((c) => c.kind === "individual")).toMatchObject({ registrationId: reg.id, preferredPeriod: "jaanuar", status: "awaiting_prepayment", course: { slug: "kulmude-lami" } });
    expect(cards.find((c) => c.kind === "contact")).toMatchObject({ registrationId: draftReg.id, course: { slug: "ootel" }, priceCents: 10000 });
  });

  test("a request's card names the course or practice package and what was asked; a waitlist card its session", async () => {
    const kati = await client();
    await db.insert(practicePackages).values({ code: "MINI", name: { et: "Mini pakett", ru: "Мини пакет" }, tagline: { et: "" }, models: 2, durationLabel: { et: "2 h" }, price: 5000 });
    // a practice request's own "course" field is free text: it must not be matched against course slugs
    const practice = await request(kati.id, "practice", { package: "MINI", course: "kulmude-lami", times: "E ja K õhtuti", email: "kati@example.test" });
    const individual = await request(kati.id, "individual", { course: "kulmude-lami", preferredPeriod: "jaanuar", message: "salajane", email: "kati@example.test" });
    const wait = await request(kati.id, "waitlist", { session: f.later.id, course: "kulmude-lami", email: "kati@example.test" });
    const cards = (await loadDashboard(db, kati.id, NOW))!.cards;
    expect(cards.find((c) => c.kind === "request" && c.requestId === practice.id)).toEqual({
      kind: "request", requestId: practice.id, requestKind: "practice", title: { et: "Mini pakett", ru: "Мини пакет" }, detail: "E ja K õhtuti", handled: false, createdAt: practice.createdAt.toISOString(),
    });
    expect(cards.find((c) => c.kind === "request" && c.requestId === individual.id)).toEqual({
      kind: "request", requestId: individual.id, requestKind: "individual", title: { et: "Kulmude lamineerimine", ru: "Ламинирование бровей" }, detail: "jaanuar", handled: false, createdAt: individual.createdAt.toISOString(),
    });
    expect(JSON.stringify(cards)).not.toContain("salajane"); // the message stays out of the card
    expect(cards.find((c) => c.kind === "waitlist")).toEqual({
      kind: "waitlist", requestId: wait.id, course: { slug: "kulmude-lami", title: { et: "Kulmude lamineerimine", ru: "Ламинирование бровей" } },
      session: { startsAt: f.later.startsAt.toISOString(), city: "Tartu", venue: "Salong" }, createdAt: wait.createdAt.toISOString(),
    });
  });

  test("a request whose payload points nowhere (no such session, a session that is not a number, a course that is gone) still shows, and the query does not fail", async () => {
    const kati = await client();
    await request(kati.id, "waitlist", { session: "abc", course: "olematu" });
    await request(kati.id, "waitlist", { session: 999999, course: "kulmude-lami" });
    await request(kati.id, "waitlist", { session: "99999999999999", course: "kulmude-lami" }); // too many digits for the id column
    await request(kati.id, "individual", { course: "olematu", preferredPeriod: "x" });
    await request(kati.id, "practice", { package: "XXL", times: "y" });
    const cards = (await loadDashboard(db, kati.id, NOW))!.cards;
    expect(cards).toHaveLength(5);
    expect(cards.filter((c) => c.kind === "waitlist").map((c) => c.kind === "waitlist" && c.session)).toEqual([null, null, null]);
    expect(cards.filter((c) => c.kind === "request").map((c) => c.kind === "request" && c.title)).toEqual([null, null]);
  });

  test("text on a request card is cut at 200 characters", async () => {
    const kati = await client();
    await request(kati.id, "individual", { course: "kulmude-lami", preferredPeriod: "x".repeat(500) });
    const [card] = (await loadDashboard(db, kati.id, NOW))!.cards;
    expect(card.kind === "request" && card.detail).toHaveLength(200);
  });

  test("contact messages and change requests are not cards", async () => {
    const kati = await client();
    const reg = await register(kati.id, f.lami.id, f.soon.id);
    await request(kati.id, "contact", { name: "Kati", message: "Tere", email: "kati@example.test" });
    await request(kati.id, "contact", { course: "veebikursus", intent: "purchase", email: "kati@example.test" });
    await request(kati.id, "change_request", { registrationId: reg.id, kind: "cancel", message: "", email: "kati@example.test" });
    expect((await loadDashboard(db, kati.id, NOW))!.cards.map((c) => c.kind)).toEqual(["contact"]);
  });

  test("only the client's own records: another client's, and ones not linked to anybody, are not shown", async () => {
    const kati = await client();
    const mari = await client("mari@example.test");
    await register(mari.id, f.lami.id, f.soon.id, { name: "Mari" });
    await register(null, f.lami.id, f.soon.id, { email: "kati@example.test" }); // the same address, but not linked (linking is the login's job)
    await request(mari.id, "practice", { package: "MINI", times: "x" });
    await request(null, "individual", { course: "kulmude-lami", preferredPeriod: "x", email: "kati@example.test" });
    await grant(mari.id, f.online.id);
    await db.insert(clientFavourites).values({ clientId: mari.id, courseId: f.lami.id });
    const dash = (await loadDashboard(db, kati.id, NOW))!;
    expect(dash.cards).toEqual([]);
    expect(dash.favourites).toEqual([]);
    expect((await loadDashboard(db, mari.id, NOW))!.cards).toHaveLength(3);
  });

  test("e-course access: active, expired and revoked are cards (the sentence differs); one for an unpublished course is hidden", async () => {
    const kati = await client();
    const second = await db.insert(courses).values({ ...base, slug: "teine-kursus", type: "e_learning", title: { et: "Teine" }, published: true, price: 100 }).returning();
    const third = await db.insert(courses).values({ ...base, slug: "kolmas-kursus", type: "e_learning", title: { et: "Kolmas" }, published: true, price: 100 }).returning();
    await grant(kati.id, f.online.id);
    await grant(kati.id, second[0].id, { expiresAt: at(-1), grantedAt: at(-30) });
    await grant(kati.id, third[0].id, { revokedAt: at(-5), grantedAt: at(-20) });
    await grant(kati.id, f.hiddenOnline.id);
    const { cards } = (await loadDashboard(db, kati.id, NOW))!;
    expect(cards.map((c) => c.kind === "ecourse" && c.course.slug)).toEqual(["veebikursus", "kolmas-kursus", "teine-kursus"]); // active first; over ones newest grant first
    expect(cards.map((c) => nextStep(c, NOW, null).key)).toEqual(["openCourse", "accessEnded", "accessEnded"]);
    expect(cards[0]).toEqual({ kind: "ecourse", course: { slug: "veebikursus", title: { et: "Veebikursus" } }, grantedAt: at(-10).toISOString(), expiresAt: at(170).toISOString(), revoked: false });
    expect(cards[1]).toMatchObject({ revoked: true });
  });

  test("favourites are the published courses the client hearted, newest first; the profile and newsletter flag are the client's", async () => {
    const kati = await client("kati@example.test", { name: "Kati", phone: "+3725551234", locale: "ru" });
    await db.insert(clientFavourites).values([
      { clientId: kati.id, courseId: f.lami.id, createdAt: at(-5) },
      { clientId: kati.id, courseId: f.draft.id, createdAt: at(-4) }, // unpublished: left out
      { clientId: kati.id, courseId: f.online.id, createdAt: at(-1) },
    ]);
    await db.insert(subscribers).values({ email: "Kati@Example.TEST", token: "t1", confirmedAt: at(-2) }); // stored in another case
    const dash = (await loadDashboard(db, kati.id, NOW))!;
    expect(dash.favourites).toEqual(["veebikursus", "kulmude-lami"]);
    expect(dash.client).toEqual({ email: "kati@example.test", name: "Kati", phone: "+3725551234", locale: "ru", newsletter: true });
  });

  test("a subscriber still waiting for confirmation is not 'on'", async () => {
    const kati = await client();
    await db.insert(subscribers).values({ email: "kati@example.test", token: "t1" });
    expect((await loadDashboard(db, kati.id, NOW))!.client.newsletter).toBe(false);
  });

  test("the prepayment setting: the strings of the instructions, null when unset or empty", async () => {
    const kati = await client();
    expect((await loadDashboard(db, kati.id, NOW))!.prepayment).toBeNull();
    await setting("prepayment", { receiver: "", iban: "", bank: "", referencePrefix: "" });
    expect((await loadDashboard(db, kati.id, NOW))!.prepayment).toBeNull();
    await setting("prepayment", { receiver: " MS LAB OÜ ", iban: "EE00 0000 0000 0000 0000", bank: "Pank", referencePrefix: "MS", extra: "x" });
    expect((await loadDashboard(db, kati.id, NOW))!.prepayment).toEqual({ receiver: "MS LAB OÜ", iban: "EE00 0000 0000 0000 0000", bank: "Pank", referencePrefix: "MS" });
  });

  test("parsePrepayment tolerates anything stored there", () => {
    expect(parsePrepayment(null)).toBeNull();
    expect(parsePrepayment("EE00")).toBeNull();
    expect(parsePrepayment([{ iban: "EE00" }])).toBeNull();
    expect(parsePrepayment({ iban: 5, bank: null })).toBeNull();
    expect(parsePrepayment({ iban: "EE00", bank: 7 })).toEqual({ receiver: "", iban: "EE00", bank: "", referencePrefix: "" });
  });

  test("a client that is gone: null", async () => {
    expect(await loadDashboard(db, 987654, NOW)).toBeNull();
  });
});

describe("favourites", () => {
  test("setFavourite hearts and un-hearts a published course and returns the list; hearting twice is the same", async () => {
    const kati = await client();
    expect(await setFavourite(db, kati.id, "kulmude-lami", true)).toEqual(["kulmude-lami"]);
    expect(await setFavourite(db, kati.id, "kulmude-lami", true)).toEqual(["kulmude-lami"]);
    expect(await setFavourite(db, kati.id, "veebikursus", true)).toEqual(["veebikursus", "kulmude-lami"]);
    expect(await setFavourite(db, kati.id, "kulmude-lami", false)).toEqual(["veebikursus"]);
    expect(await setFavourite(db, kati.id, "kulmude-lami", false)).toEqual(["veebikursus"]); // not there: fine
    expect(await db.select().from(clientFavourites)).toHaveLength(1);
  });

  test("hearting a course that does not exist or is not published is refused (null); taking one off is always fine", async () => {
    const kati = await client();
    expect(await setFavourite(db, kati.id, "olematu", true)).toBeNull();
    expect(await setFavourite(db, kati.id, "ootel", true)).toBeNull();
    expect(await db.select().from(clientFavourites)).toEqual([]);
    expect(await setFavourite(db, kati.id, "olematu", false)).toEqual([]);
    // a heart on a course that was unpublished later can be taken off, though it is not listed
    await db.insert(clientFavourites).values({ clientId: kati.id, courseId: f.draft.id });
    expect(await setFavourite(db, kati.id, "ootel", false)).toEqual([]);
    expect(await db.select().from(clientFavourites)).toEqual([]);
  });

  test("a client's hearts are its own", async () => {
    const kati = await client();
    const mari = await client("mari@example.test");
    await setFavourite(db, mari.id, "kulmude-lami", true);
    expect(await setFavourite(db, kati.id, "kulmude-lami", false)).toEqual([]);
    expect(await favouriteSlugs(db, mari.id)).toEqual(["kulmude-lami"]);
  });

  test("mergeFavourites adds what exists and is published, ignores unknown slugs and duplicates, and keeps what is there", async () => {
    const kati = await client();
    await setFavourite(db, kati.id, "veebikursus", true);
    const merged = await mergeFavourites(db, kati.id, ["kulmude-lami", "olematu", "ootel", "kulmude-lami", "veebikursus", "peidus-kursus", ""]);
    expect([...merged].sort()).toEqual(["kulmude-lami", "veebikursus"]);
    expect(await db.select().from(clientFavourites)).toHaveLength(2);
    expect(await mergeFavourites(db, kati.id, [])).toEqual(merged);
  });
});

describe("profile and newsletter", () => {
  test("updateProfile saves name, phone and language, for that client only", async () => {
    const kati = await client();
    const mari = await client("mari@example.test", { name: "Mari" });
    expect(await updateProfile(db, kati.id, { name: "Kati Tamm", phone: "+3725551234", locale: "ru" })).toBe(true);
    expect(await db.select().from(clients).where(eq(clients.id, kati.id))).toMatchObject([{ name: "Kati Tamm", phone: "+3725551234", locale: "ru", email: "kati@example.test" }]);
    expect((await db.select().from(clients).where(eq(clients.id, mari.id)))[0].name).toBe("Mari");
    expect(await updateProfile(db, 987654, { name: "x", phone: "", locale: "et" })).toBe(false);
  });

  test("newsletter on makes a confirmed subscriber of the account's address, linked to the client, in its language; on again changes nothing", async () => {
    const kati = await client("kati@example.test", { locale: "ru" });
    expect(await setNewsletter(db, kati.id, true, NOW)).toBe(true);
    const [sub] = await db.select().from(subscribers);
    expect(sub).toMatchObject({ email: "kati@example.test", locale: "ru", clientId: kati.id, confirmedAt: NOW, consentAt: NOW });
    expect(sub.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    await setNewsletter(db, kati.id, true, at(1));
    expect(await db.select().from(subscribers)).toEqual([sub]);
    expect((await loadDashboard(db, kati.id, NOW))!.client.newsletter).toBe(true);
  });

  test("newsletter on confirms an address that was waiting for it (the first consent time is kept) and reuses a row stored in another case", async () => {
    const kati = await client();
    await db.insert(subscribers).values({ email: "KATI@example.test", token: "t1", consentAt: at(-9) });
    await setNewsletter(db, kati.id, true, NOW);
    const rows = await db.select().from(subscribers);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "KATI@example.test", token: "t1", clientId: kati.id, confirmedAt: NOW, consentAt: at(-9) });
    // already confirmed: the first confirmation time stays
    await setNewsletter(db, kati.id, true, at(3));
    expect((await db.select().from(subscribers))[0].confirmedAt).toEqual(NOW);
  });

  test("newsletter off deletes the subscriber of the address (whatever its case or state), and only that one", async () => {
    const kati = await client();
    await db.insert(subscribers).values([{ email: "Kati@example.test", token: "t1" }, { email: "mari@example.test", token: "t2", confirmedAt: NOW }]);
    expect(await setNewsletter(db, kati.id, false, NOW)).toBe(true);
    expect((await db.select().from(subscribers)).map((s) => s.email)).toEqual(["mari@example.test"]);
    expect(await setNewsletter(db, kati.id, false, NOW)).toBe(true); // nothing to delete: fine
    expect(await setNewsletter(db, 987654, true, NOW)).toBe(false);
    expect(await setNewsletter(db, 987654, false, NOW)).toBe(false);
  });
});

describe("createChangeRequest", () => {
  test("stores a change_request for the client's own registration and changes nothing else", async () => {
    const kati = await client();
    const reg = await register(kati.id, f.lami.id, f.soon.id, { status: "confirmed", paidCents: 35000 });
    const info = await createChangeRequest(db, kati.id, reg.id, "cancel", "Haigestusin");
    expect(info).toEqual({
      registrationId: reg.id, course: "Kulmude lamineerimine", session: { startsAt: f.soon.startsAt, city: "Pärnu", venue: "Salong" },
      name: "Kati Tamm", email: "kati@example.test", phone: "+3725551234", locale: "et",
    });
    const rows = await db.select().from(requests);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "change_request", clientId: kati.id, handled: false,
      payload: { registrationId: reg.id, kind: "cancel", message: "Haigestusin", email: "kati@example.test" },
    });
    expect((await db.select().from(registrations).where(eq(registrations.id, reg.id)))[0]).toEqual(reg); // untouched
  });

  test("a registration without a session works too (an individual course)", async () => {
    const kati = await client();
    const reg = await register(kati.id, f.lami.id, null, { kind: "individual", name: "", phone: "" });
    await db.update(clients).set({ name: "Kati", phone: "123" }).where(eq(clients.id, kati.id));
    expect(await createChangeRequest(db, kati.id, reg.id, "change", "")).toMatchObject({ session: null, name: "Kati", phone: "123" });
    expect((await db.select().from(requests))[0].payload).toEqual({ registrationId: reg.id, kind: "change", message: "", email: "kati@example.test" });
  });

  test("refused (false, nothing stored) for another client's registration, one linked to nobody, and one that does not exist", async () => {
    const kati = await client();
    const mari = await client("mari@example.test");
    const maris = await register(mari.id, f.lami.id, f.soon.id, { email: "mari@example.test" });
    const loose = await register(null, f.lami.id, f.soon.id); // the same address as Kati's, not linked
    expect(await createChangeRequest(db, kati.id, maris.id, "cancel", "x")).toBe(false);
    expect(await createChangeRequest(db, kati.id, loose.id, "cancel", "x")).toBe(false);
    expect(await createChangeRequest(db, kati.id, 987654, "cancel", "x")).toBe(false);
    expect(await db.select().from(requests)).toEqual([]);
  });
});

describe("e-course and terms", () => {
  const TERMS = { title: { et: "E-koolituse tingimused" }, body: { et: "Ligipääs on isiklik.", ru: "Доступ личный." } };

  test("the e-course view: the course, its modules, the access end and the terms still to accept (with their text)", async () => {
    const kati = await client();
    await grant(kati.id, f.online.id);
    await db.insert(pages).values({ key: "course_terms", ...TERMS });
    expect(await loadEcourse(db, kati.id, "veebikursus", NOW)).toEqual({
      course: { slug: "veebikursus", title: { et: "Veebikursus" }, modules: [{ et: "Sissejuhatus" }, { et: "Praktika", ru: "Практика" }] },
      access: { expiresAt: at(170).toISOString() },
      terms: { accepted: false, text: TERMS.body },
    });
  });

  test("no terms text stored: the notice has no text, the acceptance is still asked for", async () => {
    const kati = await client();
    await grant(kati.id, f.online.id);
    expect((await loadEcourse(db, kati.id, "veebikursus", NOW))!.terms).toEqual({ accepted: false, text: null });
  });

  test("null without access: none, another client's, revoked, expired, an unpublished course, an unknown slug", async () => {
    const kati = await client();
    const mari = await client("mari@example.test");
    expect(await loadEcourse(db, kati.id, "veebikursus", NOW)).toBeNull();
    await grant(mari.id, f.online.id);
    expect(await loadEcourse(db, kati.id, "veebikursus", NOW)).toBeNull();
    await grant(kati.id, f.hiddenOnline.id);
    expect(await loadEcourse(db, kati.id, "peidus-kursus", NOW)).toBeNull();
    expect(await loadEcourse(db, kati.id, "olematu", NOW)).toBeNull();
    await grant(kati.id, f.online.id, { revokedAt: at(-1) });
    expect(await loadEcourse(db, kati.id, "veebikursus", NOW)).toBeNull();
    await db.update(courseAccess).set({ revokedAt: null, expiresAt: at(-1) }).where(eq(courseAccess.clientId, kati.id));
    expect(await loadEcourse(db, kati.id, "veebikursus", NOW)).toBeNull();
    // until, not including, the moment access ends
    await db.update(courseAccess).set({ expiresAt: NOW }).where(eq(courseAccess.clientId, kati.id));
    expect(await loadEcourse(db, kati.id, "veebikursus", NOW)).toBeNull();
    await db.update(courseAccess).set({ expiresAt: new Date(NOW.getTime() + 1) }).where(eq(courseAccess.clientId, kati.id));
    expect(await loadEcourse(db, kati.id, "veebikursus", NOW)).not.toBeNull();
  });

  test("the version is the settings key courseTermsVersion, \"1\" until the admin has saved the terms", async () => {
    expect(await courseTermsVersion(db)).toBe("1");
    await setting("courseTermsVersion", "");
    expect(await courseTermsVersion(db)).toBe("1");
    await setting("courseTermsVersion", 5);
    expect(await courseTermsVersion(db)).toBe("1");
    await setting("courseTermsVersion", "2026-10-01T09:00:00.000Z");
    expect(await courseTermsVersion(db)).toBe("2026-10-01T09:00:00.000Z");
  });

  test("accepting stores the current version for this client and course; the notice then stays away, and the text is not sent again", async () => {
    const kati = await client();
    await grant(kati.id, f.online.id);
    await db.insert(pages).values({ key: "course_terms", ...TERMS });
    expect(await acceptTerms(db, kati.id, "veebikursus", NOW)).toBe(true);
    expect(await db.select().from(termsAcceptances)).toEqual([{ clientId: kati.id, courseId: f.online.id, termsVersion: "1", acceptedAt: NOW }]);
    expect((await loadEcourse(db, kati.id, "veebikursus", NOW))!.terms).toEqual({ accepted: true, text: null });
    expect(await acceptTerms(db, kati.id, "veebikursus", at(1))).toBe(true); // again: nothing changes
    expect(await db.select().from(termsAcceptances)).toHaveLength(1);
  });

  test("a new terms version asks again, and accepting stores that version next to the old one", async () => {
    const kati = await client();
    await grant(kati.id, f.online.id);
    await acceptTerms(db, kati.id, "veebikursus", NOW);
    await setting("courseTermsVersion", "2026-11-01T09:00:00.000Z");
    expect((await loadEcourse(db, kati.id, "veebikursus", at(40)))!.terms.accepted).toBe(false);
    await acceptTerms(db, kati.id, "veebikursus", at(40));
    expect((await db.select().from(termsAcceptances)).map((t) => t.termsVersion).sort()).toEqual(["1", "2026-11-01T09:00:00.000Z"]);
    expect((await loadEcourse(db, kati.id, "veebikursus", at(40)))!.terms.accepted).toBe(true);
  });

  test("an acceptance is per client: another client's does not count", async () => {
    const kati = await client();
    const mari = await client("mari@example.test");
    await grant(kati.id, f.online.id);
    await grant(mari.id, f.online.id);
    await acceptTerms(db, mari.id, "veebikursus", NOW);
    expect((await loadEcourse(db, kati.id, "veebikursus", NOW))!.terms.accepted).toBe(false);
  });

  test("accepting needs active access to a published course: none, expired, revoked, unpublished, another client's, unknown slug (false, nothing stored)", async () => {
    const kati = await client();
    const mari = await client("mari@example.test");
    expect(await acceptTerms(db, kati.id, "veebikursus", NOW)).toBe(false);
    await grant(mari.id, f.online.id);
    expect(await acceptTerms(db, kati.id, "veebikursus", NOW)).toBe(false);
    await grant(kati.id, f.hiddenOnline.id);
    expect(await acceptTerms(db, kati.id, "peidus-kursus", NOW)).toBe(false);
    expect(await acceptTerms(db, kati.id, "olematu", NOW)).toBe(false);
    expect(await acceptTerms(db, kati.id, "kulmude-lami", NOW)).toBe(false); // a published course, but no access
    await grant(kati.id, f.online.id, { expiresAt: at(-1) });
    expect(await acceptTerms(db, kati.id, "veebikursus", NOW)).toBe(false);
    await db.update(courseAccess).set({ expiresAt: at(30), revokedAt: at(-1) }).where(and(eq(courseAccess.clientId, kati.id), eq(courseAccess.courseId, f.online.id)));
    expect(await acceptTerms(db, kati.id, "veebikursus", NOW)).toBe(false);
    expect(await db.select().from(termsAcceptances)).toEqual([]);
  });
});

describe("deleteClient", () => {
  test("deletes the client and what hangs on it, keeps the registrations and requests unlinked with their name and address as given, and unsubscribes the address", async () => {
    const kati = await client("kati@example.test", { name: "Kati", locale: "ru" });
    const mari = await client("mari@example.test");
    const reg = await register(kati.id, f.lami.id, f.soon.id, { name: "Kati Tamm" });
    const maris = await register(mari.id, f.lami.id, f.soon.id, { name: "Mari", email: "mari@example.test" });
    const req = await request(kati.id, "individual", { course: "kulmude-lami", preferredPeriod: "x", email: "kati@example.test" });
    await grant(kati.id, f.online.id);
    await grant(mari.id, f.online.id);
    await acceptTerms(db, kati.id, "veebikursus", NOW);
    await db.insert(clientFavourites).values([{ clientId: kati.id, courseId: f.lami.id }, { clientId: mari.id, courseId: f.lami.id }]);
    await db.insert(clientSessions).values({ idHash: "h1", clientId: kati.id, expiresAt: at(100) });
    await db.insert(subscribers).values([{ email: "Kati@example.test", token: "t1", confirmedAt: NOW, clientId: kati.id }, { email: "mari@example.test", token: "t2", clientId: mari.id }]);

    expect(await deleteClient(db, kati.id)).toEqual({ email: "kati@example.test", locale: "ru" });

    expect((await db.select().from(clients)).map((c) => c.email)).toEqual(["mari@example.test"]);
    expect(await db.select().from(clientSessions)).toEqual([]);
    expect(await db.select().from(termsAcceptances)).toEqual([]);
    expect(await db.select().from(courseAccess).then((rows) => rows.map((r) => r.clientId))).toEqual([mari.id]);
    expect(await db.select().from(clientFavourites).then((rows) => rows.map((r) => r.clientId))).toEqual([mari.id]);
    expect((await db.select().from(subscribers)).map((s) => s.email)).toEqual(["mari@example.test"]);
    // the booking stays with Maria: unlinked, nothing else changed
    expect((await db.select().from(registrations).where(eq(registrations.id, reg.id)))[0]).toEqual({ ...reg, clientId: null });
    expect((await db.select().from(requests).where(eq(requests.id, req.id)))[0]).toEqual({ ...req, clientId: null });
    expect((await db.select().from(registrations).where(eq(registrations.id, maris.id)))[0]).toEqual(maris);
  });

  test("a client that is gone: null (deleting twice is fine)", async () => {
    const kati = await client();
    expect(await deleteClient(db, kati.id)).not.toBeNull();
    expect(await deleteClient(db, kati.id)).toBeNull();
  });
});
