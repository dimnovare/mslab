import { isNull } from "drizzle-orm";
import { expect, test } from "vitest";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { clients, clientSessions, courses, mailQuota, registrations, requests, subscribers } from "@/db/schema";
import {
  issueClientLogin, redeemClientLink, redeemClientCode, getClientSession, endClientSession, reserveLoginMail, CODE_ATTEMPTS,
} from "@/server/client-auth";

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
  expect(await getClientSession(db, b!.sessionRaw, later(2000))).toEqual({ clientId: b!.clientId });
  expect(await db.select().from(clientSessions).where(isNull(clientSessions.endedAt))).toHaveLength(1);
  await endClientSession(db, b!.sessionRaw, later(3000));
  expect(await getClientSession(db, b!.sessionRaw, later(4000))).toEqual({ ended: "logout" });
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

/** makeTestDb() migrates but does not seed: a contact course of its own, then a group registration on it. */
async function insertRegistration(db: Db, email: string) {
  const [course] = await db.insert(courses)
    .values({ slug: "auth-contact", type: "contact", level: "basic", title: { et: "A" }, summary: { et: "" }, body: { et: "" } })
    .returning();
  await db.insert(registrations).values({ courseId: course.id, kind: "group", name: "Kati", email, paymentChoice: "half" });
}
