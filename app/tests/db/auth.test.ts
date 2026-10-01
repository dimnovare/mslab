import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "./helpers";
import { adminSessions, authTokens } from "@/db/schema";
import {
  SESSION_TTL_MS,
  TOKEN_TTL_MS,
  adminFirstName,
  consumeLoginToken,
  createLoginToken,
  createSession,
  deleteSession,
  getSessionEmail,
  isAllowedAdmin,
} from "@/server/auth";
import { sha256 } from "@/server/token";

const DIM = "dim@example.test";
const MIN = 60_000;

test("token is single use and expires", async () => {
  const db = await makeTestDb();
  const now = new Date("2026-10-01T10:00:00Z");
  const t = await createLoginToken(db, "dim@example.test", now);
  expect(await consumeLoginToken(db, t, new Date(now.getTime() + 60_000))).toBe("dim@example.test");
  expect(await consumeLoginToken(db, t, new Date(now.getTime() + 61_000))).toBeNull();
  const t2 = await createLoginToken(db, "dim@example.test", now);
  expect(await consumeLoginToken(db, t2, new Date(now.getTime() + 16 * 60_000))).toBeNull();
});

test("allow-list", () => {
  const allow = "dim@example.test,maria@example.test";
  expect(isAllowedAdmin(" maria@example.test ", allow)).toBe(true);
  expect(isAllowedAdmin("someone@gmail.com", allow)).toBe(false);
});

test("session lookup", async () => {
  const db = await makeTestDb();
  const s = await createSession(db, "dim@example.test");
  expect(await getSessionEmail(db, s)).toBe("dim@example.test");
  expect(await getSessionEmail(db, "nope")).toBeNull();
});

describe("allow-list edge cases", () => {
  test("the list is trimmed and case-insensitive; blanks and empty input never match", () => {
    expect(isAllowedAdmin("dim@example.test", " dim@example.test , maria@example.test ")).toBe(true);
    expect(isAllowedAdmin("", "dim@example.test,,")).toBe(false);
    expect(isAllowedAdmin("   ", ",  ,")).toBe(false);
    expect(isAllowedAdmin(DIM, "")).toBe(false);
  });
  test("only a whole address matches (no substring, no domain)", () => {
    const allow = "dim@example.test";
    expect(isAllowedAdmin("dim@example.test", allow)).toBe(false);
    expect(isAllowedAdmin("dim@example.test.evil.test", allow)).toBe(false);
    expect(isAllowedAdmin("x@gmail.com,dim@example.test", allow)).toBe(false);
  });
  test("first names for the greeting", () => {
    expect(adminFirstName("maria@example.test")).toBe("Maria");
    expect(adminFirstName("dim@example.test")).toBe("Dim");
    expect(adminFirstName("kati.kask@example.com")).toBe("Kati");
  });
});

describe("login tokens", () => {
  const now = new Date("2026-10-01T10:00:00Z");

  test("32 random bytes (43 base64url characters), stored only as a SHA-256 hash, valid for 15 minutes", async () => {
    const db = await makeTestDb();
    const raw = await createLoginToken(db, DIM, now);
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await db.select().from(authTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).toBe(await sha256(raw));
    expect(rows[0].hash).not.toContain(raw);
    expect(rows[0].email).toBe(DIM);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].expiresAt.getTime() - now.getTime()).toBe(TOKEN_TTL_MS);
    expect(TOKEN_TTL_MS).toBe(15 * MIN);
    expect(await createLoginToken(db, DIM, now)).not.toBe(raw);
  });

  test("the e-mail is stored trimmed and lowercased and comes back that way", async () => {
    const db = await makeTestDb();
    const raw = await createLoginToken(db, "  dim@example.test ", now);
    expect(await consumeLoginToken(db, raw, now)).toBe(DIM);
  });

  test("valid up to (not including) the expiry minute", async () => {
    const db = await makeTestDb();
    const a = await createLoginToken(db, DIM, now);
    expect(await consumeLoginToken(db, a, new Date(now.getTime() + 15 * MIN - 1))).toBe(DIM);
    const b = await createLoginToken(db, DIM, now);
    expect(await consumeLoginToken(db, b, new Date(now.getTime() + 15 * MIN))).toBeNull();
  });

  test("an unknown, empty or hash-valued token is refused", async () => {
    const db = await makeTestDb();
    const raw = await createLoginToken(db, DIM, now);
    expect(await consumeLoginToken(db, "", now)).toBeNull();
    expect(await consumeLoginToken(db, "x".repeat(43), now)).toBeNull();
    // the stored hash must not work as a token
    expect(await consumeLoginToken(db, await sha256(raw), now)).toBeNull();
    expect(await consumeLoginToken(db, raw, now)).toBe(DIM);
  });

  test("two simultaneous attempts: exactly one gets in", async () => {
    const db = await makeTestDb();
    const raw = await createLoginToken(db, DIM, now);
    const results = await Promise.all([consumeLoginToken(db, raw, now), consumeLoginToken(db, raw, now), consumeLoginToken(db, raw, now)]);
    expect(results.filter((r) => r === DIM)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(2);
  });

  test("a used token keeps its row, marked used", async () => {
    const db = await makeTestDb();
    const raw = await createLoginToken(db, DIM, now);
    const used = new Date(now.getTime() + MIN);
    await consumeLoginToken(db, raw, used);
    const [row] = await db.select().from(authTokens).where(eq(authTokens.hash, await sha256(raw)));
    expect(row.usedAt).toEqual(used);
  });

  test("expired tokens are swept when a new one is created; live ones stay", async () => {
    const db = await makeTestDb();
    const old = await createLoginToken(db, DIM, now);
    const later = new Date(now.getTime() + 20 * MIN);
    const fresh = await createLoginToken(db, DIM, later);
    const hashes = (await db.select().from(authTokens)).map((r) => r.hash);
    expect(hashes).toEqual([await sha256(fresh)]);
    expect(hashes).not.toContain(await sha256(old));
  });
});

describe("sessions", () => {
  const now = new Date("2026-10-01T10:00:00Z");

  test("raw id is 32 random bytes, stored only as a hash, valid for 30 days", async () => {
    const db = await makeTestDb();
    const raw = await createSession(db, " maria@example.test", now);
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await db.select().from(adminSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].idHash).toBe(await sha256(raw));
    expect(rows[0].email).toBe("maria@example.test");
    expect(rows[0].expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * MIN);
  });

  test("lookup honours the expiry and refuses missing, empty and hash-valued ids", async () => {
    const db = await makeTestDb();
    const raw = await createSession(db, DIM, now);
    expect(await getSessionEmail(db, raw, new Date(now.getTime() + SESSION_TTL_MS - 1))).toBe(DIM);
    expect(await getSessionEmail(db, raw, new Date(now.getTime() + SESSION_TTL_MS))).toBeNull();
    expect(await getSessionEmail(db, undefined, now)).toBeNull();
    expect(await getSessionEmail(db, "", now)).toBeNull();
    expect(await getSessionEmail(db, await sha256(raw), now)).toBeNull();
  });

  test("deleteSession ends it; other sessions stay; unknown ids are ignored", async () => {
    const db = await makeTestDb();
    const a = await createSession(db, DIM, now);
    const b = await createSession(db, DIM, now);
    await deleteSession(db, a);
    await deleteSession(db, "never-issued");
    await deleteSession(db, undefined);
    expect(await getSessionEmail(db, a, now)).toBeNull();
    expect(await getSessionEmail(db, b, now)).toBe(DIM);
  });

  test("expired sessions are swept when a new one is created", async () => {
    const db = await makeTestDb();
    const old = await createSession(db, DIM, now);
    const later = new Date(now.getTime() + SESSION_TTL_MS + MIN);
    const fresh = await createSession(db, DIM, later);
    const hashes = (await db.select().from(adminSessions)).map((r) => r.idHash);
    expect(hashes).toEqual([await sha256(fresh)]);
    expect(hashes).not.toContain(await sha256(old));
  });
});
