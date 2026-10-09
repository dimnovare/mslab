import { isNull } from "drizzle-orm";
import { expect, test } from "vitest";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { clients, clientSessions, courses, mailQuota, registrations, requests, subscribers } from "@/db/schema";
import {
  issueClientLogin, redeemClientLink, redeemClientCode, getClientSession, endClientSession, reserveLoginMail, reserveNewsletterMail, NEWSLETTER_MAIL_DAILY_CAP, CODE_ATTEMPTS,
} from "@/server/client-auth";
import { loadDashboard, updateProfile } from "@/server/client-data";

const T0 = new Date("2026-10-02T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

test("link login creates the client once and links earlier records by e-mail", async () => {
  const db = await makeTestDb();
  await insertRegistration(db, "Kati@Example.test"); // helper below: any course, kind group
  const { token } = (await issueClientLogin(db, "kati@example.test", T0))!;
  const first = await redeemClientLink(db, token, later(60_000));
  expect(first?.isNew).toBe(true);
  expect(await redeemClientLink(db, token, later(61_000))).toBeNull(); // single use
  const [reg] = await db.select().from(registrations);
  expect(reg.clientId).toBe(first!.clientId);
  expect(await db.select().from(clients)).toHaveLength(1);
});

test("code login: right code works once, wrong codes count, 5 wrong kill the token", async () => {
  const db = await makeTestDb();
  const { code } = (await issueClientLogin(db, "kati@example.test", T0))!;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < CODE_ATTEMPTS - 1; i++) expect(await redeemClientCode(db, "kati@example.test", wrong, T0)).toBe("wrong");
  expect(await redeemClientCode(db, "KATI@example.test", code, T0)).toMatchObject({ isNew: true });
  const again = (await issueClientLogin(db, "kati@example.test", T0))!;
  for (let i = 0; i < CODE_ATTEMPTS; i++) await redeemClientCode(db, "kati@example.test", wrong, T0);
  expect(await redeemClientCode(db, "kati@example.test", again.code, T0)).toBeNull();
});

test("the login page's language goes to a client the login creates, never to an existing one (fix round 1)", async () => {
  const db = await makeTestDb();
  const byLink = await redeemClientLink(db, (await issueClientLogin(db, "olga@example.test", T0))!.token, T0, "ru");
  expect(byLink).toMatchObject({ isNew: true, locale: "ru" });
  const byCode = await redeemClientCode(db, "irina@example.test", (await issueClientLogin(db, "irina@example.test", T0))!.code, T0, "ru");
  expect(byCode).toMatchObject({ isNew: true, locale: "ru" });
  expect(await redeemClientLink(db, (await issueClientLogin(db, "mari@example.test", T0))!.token, T0)).toMatchObject({ isNew: true, locale: "et" });
  // existing clients keep theirs, whatever the page
  expect(await redeemClientLink(db, (await issueClientLogin(db, "mari@example.test", T0))!.token, later(1000), "ru")).toMatchObject({ isNew: false, locale: "et" });
  expect(await redeemClientCode(db, "olga@example.test", (await issueClientLogin(db, "olga@example.test", T0))!.code, later(2000), "et")).toMatchObject({ isNew: false, locale: "ru" });
  const stored = Object.fromEntries((await db.select().from(clients)).map((c) => [c.email, c.locale]));
  expect(stored).toEqual({ "olga@example.test": "ru", "irina@example.test": "ru", "mari@example.test": "et" });
});

test("expired after 30 minutes", async () => {
  const db = await makeTestDb();
  const { token } = (await issueClientLogin(db, "kati@example.test", T0))!;
  expect(await redeemClientLink(db, token, later(30 * 60_000 + 1))).toBeNull();
});

test("one device: a new login ends the other session with 'replaced'", async () => {
  const db = await makeTestDb();
  const a = await redeemClientLink(db, (await issueClientLogin(db, "kati@example.test", T0))!.token, T0);
  const b = await redeemClientLink(db, (await issueClientLogin(db, "kati@example.test", T0))!.token, later(1000));
  expect(await getClientSession(db, a!.sessionRaw, later(2000))).toEqual({ ended: "replaced" });
  expect(await getClientSession(db, b!.sessionRaw, later(2000))).toEqual({ clientId: b!.clientId, renewed: false });
  expect(await db.select().from(clientSessions).where(isNull(clientSessions.endedAt))).toHaveLength(1);
  await endClientSession(db, b!.sessionRaw, later(3000));
  expect(await getClientSession(db, b!.sessionRaw, later(4000))).toEqual({ ended: "logout" });
});

test("a session is renewed on use, at most once a day, and says so (the caller then sends the cookies again)", async () => {
  const db = await makeTestDb();
  const day = 86_400_000;
  const s = (await redeemClientLink(db, (await issueClientLogin(db, "kati@example.test", T0))!.token, T0))!;
  const expiry = async () => (await db.select().from(clientSessions))[0].expiresAt.getTime();
  expect(await expiry()).toBe(T0.getTime() + 180 * day);
  expect(await getClientSession(db, s.sessionRaw, later(3_600_000))).toEqual({ clientId: s.clientId, renewed: false }); // within the first day
  expect(await expiry()).toBe(T0.getTime() + 180 * day);
  expect(await getClientSession(db, s.sessionRaw, later(100 * day))).toEqual({ clientId: s.clientId, renewed: true });
  expect(await expiry()).toBe(T0.getTime() + 280 * day);
  expect(await getClientSession(db, s.sessionRaw, later(100 * day + 3_600_000))).toEqual({ clientId: s.clientId, renewed: false }); // same day
  expect(await getClientSession(db, s.sessionRaw, later(181 * day))).toEqual({ clientId: s.clientId, renewed: true }); // past the first 180 days
  expect(await getClientSession(db, s.sessionRaw, later(181 * day + 280 * day))).toEqual({ ended: "expired" });
});

test("at most 3 live logins per address", async () => {
  const db = await makeTestDb();
  for (let i = 0; i < 3; i++) expect(await issueClientLogin(db, "kati@example.test", T0)).not.toBeNull();
  expect(await issueClientLogin(db, "kati@example.test", T0)).toBeNull();
});

test("daily mail cap", async () => {
  const db = await makeTestDb();
  expect(await reserveLoginMail(db, T0, 2)).toBe(true);
  expect(await reserveLoginMail(db, T0, 2)).toBe(true);
  expect(await reserveLoginMail(db, T0, 2)).toBe(false);
  expect(await db.select().from(mailQuota)).toEqual([{ day: "2026-10-02", sent: 2 }]); // a refused mail is not counted
  expect(await reserveLoginMail(db, new Date("2026-10-03T10:00:00Z"), 2)).toBe(true);
});

test("the newsletter's own daily counter: a row of its own per day, its own cap, and neither counter touches the other", async () => {
  const db = await makeTestDb();
  expect(NEWSLETTER_MAIL_DAILY_CAP).toBe(25);
  expect(await reserveNewsletterMail(db, T0, 2)).toBe(true);
  expect(await reserveNewsletterMail(db, T0, 2)).toBe(true);
  expect(await reserveNewsletterMail(db, T0, 2)).toBe(false);
  // the shared counter is still empty for the same day, and a full newsletter counter leaves it alone (and the other way round)
  expect(await reserveLoginMail(db, T0, 2)).toBe(true);
  expect(await reserveLoginMail(db, T0, 2)).toBe(true);
  expect(await reserveLoginMail(db, T0, 2)).toBe(false);
  expect((await db.select().from(mailQuota)).sort((a, b) => a.day.localeCompare(b.day))).toEqual([{ day: "2026-10-02", sent: 2 }, { day: "2026-10-02:nl", sent: 2 }]);
  expect(await reserveNewsletterMail(db, new Date("2026-10-03T10:00:00Z"), 2)).toBe(true); // the next day starts again
  // the default cap is 25: the 26th is refused
  for (let i = 0; i < NEWSLETTER_MAIL_DAILY_CAP; i++) expect(await reserveNewsletterMail(db, new Date("2026-10-04T10:00:00Z")), String(i)).toBe(true);
  expect(await reserveNewsletterMail(db, new Date("2026-10-04T10:00:00Z"))).toBe(false);
});

test("a login links requests and the newsletter row by e-mail, and only those of that address", async () => {
  const db = await makeTestDb();
  await db.insert(requests).values([
    { kind: "contact", payload: { email: "KATI@example.test", name: "Kati" } },
    { kind: "contact", payload: { email: "mari@example.test", name: "Mari" } },
    { kind: "contact", payload: { name: "No address" } },
  ]);
  await db.insert(subscribers).values([
    { email: "kati@example.test", token: "t1" },
    { email: "mari@example.test", token: "t2" },
  ]);
  const login = await redeemClientLink(db, (await issueClientLogin(db, "Kati@example.test", T0))!.token, T0);
  const linked = (rows: { clientId: number | null }[]) => rows.filter((r) => r.clientId === login!.clientId).length;
  expect(linked(await db.select().from(requests))).toBe(1);
  expect((await db.select().from(requests)).filter((r) => r.clientId !== null)[0].payload.name).toBe("Kati");
  expect(linked(await db.select().from(subscribers))).toBe(1);
  expect((await db.select().from(subscribers)).filter((r) => r.clientId === null).map((r) => r.email)).toEqual(["mari@example.test"]);
});

test("the first login takes the name and phone from the newest registration or request of the address that has each (spec 2.1 rule 4)", async () => {
  const db = await makeTestDb();
  await insertRegistration(db, "Mari@Example.test", { name: "Mari Maasikas", phone: "+372 5555 0001", createdAt: new Date("2026-09-01T10:00:00Z") });
  // newer: a waitlist entry (a name, no phone) and somebody else's request
  await db.insert(requests).values([
    { kind: "waitlist", payload: { email: "mari@example.test", name: "Mari M." }, createdAt: new Date("2026-09-10T10:00:00Z") },
    { kind: "individual", payload: { email: "kati@example.test", name: "Kati", phone: "+372 5555 0009" }, createdAt: new Date("2026-09-20T10:00:00Z") },
  ]);
  const login = await redeemClientLink(db, (await issueClientLogin(db, "mari@example.test", T0))!.token, T0);
  expect(login).toMatchObject({ isNew: true });
  const [client] = await db.select().from(clients);
  expect(client).toMatchObject({ name: "Mari M.", phone: "+372 5555 0001" });
  expect((await loadDashboard(db, client.id, T0))!.client).toMatchObject({ name: "Mari M.", phone: "+372 5555 0001" }); // "Tere, Mari!"
});

test("a later login fills only empty fields from the records it links now: what she saved stays, and a field she emptied is not filled again", async () => {
  const db = await makeTestDb();
  const first = (await redeemClientLink(db, (await issueClientLogin(db, "mari@example.test", T0))!.token, T0))!;
  await updateProfile(db, first.clientId, { name: "Mari", phone: "", locale: "et" });
  // a registration nobody linked (made before the account existed elsewhere, or by hand)
  await insertRegistration(db, "mari@example.test", { name: "Maria Maasikas", phone: "+372 5555 0002" });
  await redeemClientLink(db, (await issueClientLogin(db, "mari@example.test", T0))!.token, later(1000));
  const profile = async () => (await db.select().from(clients))[0];
  expect(await profile()).toMatchObject({ name: "Mari", phone: "+372 5555 0002" });
  // she empties the phone in Minu andmed: the next login links nothing new, so nothing comes back
  await updateProfile(db, first.clientId, { name: "Mari", phone: "", locale: "et" });
  await redeemClientLink(db, (await issueClientLogin(db, "mari@example.test", T0))!.token, later(2000));
  expect(await profile()).toMatchObject({ name: "Mari", phone: "" });
});

/** makeTestDb() migrates but does not seed: a contact course of its own, then a group registration on it. */
async function insertRegistration(db: Db, email: string, over: Partial<typeof registrations.$inferInsert> = {}) {
  const [course] = await db.insert(courses)
    .values({ slug: `auth-contact-${Math.random().toString(36).slice(2)}`, type: "contact", level: "basic", title: { et: "A" }, summary: { et: "" }, body: { et: "" } })
    .returning();
  await db.insert(registrations).values({ courseId: course.id, kind: "group", name: "Kati", email, paymentChoice: "half", ...over });
}
