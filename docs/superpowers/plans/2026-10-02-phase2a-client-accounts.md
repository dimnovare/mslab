# MS LAB Phase 2a — Client Accounts Implementation Plan

> **Note (03.10.2026):** this describes the Cloudflare Workers setup, which is retired. The site runs on Vercel now (the design hub is static files in `app/public`); see [`docs/deploy.md`](../../deploy.md) for the current hosting.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students log in with an e-mail code or link and see "Minu koolitused", their favourites and their details; admins grant e-course access and can view any client's screen read-only — all inside Cloudflare Workers Free.

**Architecture:** Client pages (`/konto…`) are ordinary cached shells; all personal data comes from a small JSON API (`/api/konto/*`) that the Worker entry answers **before OpenNext** (like `/media`), with its own request-scoped Postgres client. The same handler is mounted as a Next route so `next dev` works. Sessions are one-device-only rows in Postgres; login uses a 6-digit code plus a link from one token.

**Tech Stack:** Next.js 16.3.8 + @opennextjs/cloudflare 1.20.7 (pinned exactly — do not upgrade), React 19, TypeScript, Drizzle 0.45 + postgres.js 3.4 (Railway via Hyperdrive), PGlite for DB tests, Vitest, Playwright, Resend, KV rate limits.

**Spec:** `docs/superpowers/specs/2026-10-02-phase2a-client-accounts-design.md` — read sections 2, 2.1 (simplicity rules, binding) and the section your task names before starting.

## Global Constraints

- Cloudflare Workers **Free**: 10 ms CPU per request. `/api/konto/*` calls must stay **≤ 8 ms CPU** (measured on the deployed Worker in Task 11). Public `/konto…` shells are cached pages: they must not read cookies, headers or `searchParams` on the server.
- Simplicity rules (spec 2.1) bind every screen and e-mail: 6-digit code **and** button in the login e-mail; code/link valid **30 minutes**, single use, 5 wrong code tries kill the token; session **180 days**, renewed on use; **one device**: a new login ends all other sessions (`end_reason = 'replaced'`); "Sinu konto avati teises seadmes" + one button "Saada uus kood"; no passwords, no set-up step; every card has one plain next-step sentence and at most one button; e-mail typo suggestion "Kas mõtlesid …?".
- **Design rules (Dim): simple in steps and words, not a new look.** The client area uses prototype B's dashboard (`site/p/b/app.js` `dashboard`, `site/p/b/styles.css`) as its visual base and the public site's existing components, fonts (Jost/Manrope), colour tokens and button styles (`ui.btn` etc.); touch targets ≥ 44 px (the current rule). Do not introduce new visual styles, colours or components where an existing one fits; reviewers check this.
- Every UI string in `src/i18n/dict/et.ts` and `ru.ts` (parity test stays green); admin strings ET-only in `src/i18n/dict/admin.ts`.
- Cookies: session `__Host-mslab_client` (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 180 days); hint `mslab_in=1` (NOT HttpOnly, Secure, SameSite=Lax, Path=/, same Max-Age) — the hint carries no secret and only lets cached pages show "Minu konto" without a request.
- Every POST/PATCH under `/api/konto/*` is refused with 403 when `isCrossSite(request)` (from `src/server/auth.ts`).
- Admin code: pages call `requireAdmin()`, route handlers use `withAdmin`, server actions are `adminAction(...)` exports in `src/server/actions/admin*.ts` (static guard test `tests/unit/admin-guards.test.ts`).
- No real e-mail addresses anywhere in the repo (guard `tests/unit/test-addresses.test.ts`); tests use `@example.test`. Never use Maria's address in a login context. The GitHub repo is **public**.
- No PII in logs: use `logFailure` from `src/server/log.ts`.
- Mobile first (design at 390 px, check 834/1440/2560); swipe on phones for the course list; `prefers-reduced-motion` respected; no horizontal page overflow.
- Fonts/colours: Jost headings and numbers, Manrope UI; only tokens from `src/styles/tokens.css`.
- Never write to Railway from tests or tools without the target guard; Railway migrations are applied by the controller (Task 11).
- Commits: Conventional Commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; repo-local git user.email stays the GitHub noreply address.

---

## File Structure

```
app/
  drizzle/0001_client_accounts.sql                 (generated, Task 1)
  src/db/schema.ts                                  (+ client tables, client_id columns, request kind)
  src/domain/email.ts                               normalizeEmail, isEmail, typoSuggestion (pure)
  src/domain/account-cards.ts                       card model + nextStep() (pure)
  src/server/client-auth.ts                         tokens, codes, sessions, linking, mail cap (DB)
  src/server/client-data.ts                         dashboard loader + client mutations (DB)
  src/server/account-api.ts                         handleAccountApi(request, deps) router (no Next imports)
  src/server/account-mail.ts                        login / confirmation / deletion e-mail texts
  src/worker/account-front.ts                       Worker-entry adapter: db client + deps → handleAccountApi
  src/app/api/konto/[[...path]]/route.ts            Next mount of the same handler (next dev / fallback)
  src/components/account/*                          client components (tab bar, cards, forms, gates)
  src/app/[locale]/(site)/konto/page.tsx            Minu koolitused shell (replaces the placeholder)
  src/app/[locale]/(site)/konto/sisene/page.tsx     login shell
  src/app/[locale]/(site)/konto/lemmikud/page.tsx   favourites shell
  src/app/[locale]/(site)/konto/andmed/page.tsx     my details shell
  src/app/[locale]/(site)/konto/kursus/[slug]/page.tsx  e-course shell
  src/server/admin-clients.ts, src/server/actions/admin-clients.ts
  src/app/admin/(panel)/opilased/page.tsx, opilased/[id]/vaade/page.tsx
  worker.ts                                         (+ account front before the cache front)
```

---

### Task 1: Schema and migration

**Files:**
- Modify: `app/src/db/schema.ts`
- Create: `app/drizzle/0001_client_accounts.sql` (+ `drizzle/meta/*` from drizzle-kit)
- Test: `app/tests/db/schema.test.ts` (extend)

**Interfaces:**
- Produces (exported from `src/db/schema.ts`): tables `clients`, `clientLoginTokens`, `clientSessions`, `courseAccess`, `termsAcceptances`, `clientFavourites`, `mailQuota`; new nullable column `clientId` on `registrations`, `requests`, `subscribers`; `requestKind` gains `"change_request"`; types `Client = typeof clients.$inferSelect`, `ClientSession = typeof clientSessions.$inferSelect`.

- [ ] **Step 1: Write the failing test** (append to `tests/db/schema.test.ts`; import `courses` from `@/db/schema` and `eq` from `drizzle-orm` if the file does not yet)

```ts
import { clients, clientSessions, courseAccess, mailQuota, registrations, requests } from "@/db/schema";

test("client tables exist and link records", async () => {
  const db = await makeTestDb();
  const [c] = await db.insert(clients).values({ email: "kati@example.test" }).returning();
  await db.insert(clientSessions).values({ idHash: "h1", clientId: c.id, expiresAt: new Date(Date.now() + 1000) });
  await db.insert(mailQuota).values({ day: "2026-10-02", sent: 1 });
  const [course] = await db.select().from(courses).limit(1);
  await db.insert(courseAccess).values({ clientId: c.id, courseId: course.id, grantedBy: "admin@example.test", expiresAt: new Date() });
  await db.insert(requests).values({ kind: "change_request", payload: { registrationId: 1 }, clientId: c.id });
  const [r] = await db.select({ clientId: registrations.clientId }).from(registrations).limit(1);
  expect(r === undefined || r.clientId === null).toBe(true);
  await db.delete(clients).where(eq(clients.id, c.id)); // cascades sessions/access, nulls requests.client_id
  expect(await db.select().from(clientSessions)).toHaveLength(0);
  expect((await db.select().from(requests).where(eq(requests.kind, "change_request")))[0].clientId).toBeNull();
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run tests/db/schema.test.ts` → "clients is not exported").

- [ ] **Step 3: Add the schema** to `src/db/schema.ts` (change the existing `requestKind` line as shown; add the tables after `subscribers`; add `primaryKey`, `index` and `type AnyPgColumn` to the `drizzle-orm/pg-core` import):

```ts
export const requestKind = pgEnum("request_kind", ["contact", "individual", "practice", "waitlist", "change_request"]);

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),                 // lowercased (normalizeEmail)
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  locale: text("locale").$type<"et" | "ru">().notNull().default("et"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("clients_email").on(t.email)]);

export const clientLoginTokens = pgTable("client_login_tokens", {
  hash: text("hash").primaryKey(),                // sha256(raw link token)
  codeHash: text("code_hash").notNull(),          // sha256(`${hash}:${code}`)
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [index("client_login_tokens_email").on(t.email)]);

export const clientSessions = pgTable("client_sessions", {
  idHash: text("id_hash").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endReason: text("end_reason").$type<"logout" | "replaced">(),
}, (t) => [index("client_sessions_client").on(t.clientId)]);

export const courseAccess = pgTable("course_access", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  grantedBy: text("granted_by").notNull(),        // admin e-mail or "payment"
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("course_access_client_course").on(t.clientId, t.courseId)]);

export const termsAcceptances = pgTable("terms_acceptances", {
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  termsVersion: text("terms_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.clientId, t.courseId, t.termsVersion] })]);

export const clientFavourites = pgTable("client_favourites", {
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.clientId, t.courseId] })]);

export const mailQuota = pgTable("mail_quota", { day: text("day").primaryKey(), sent: integer("sent").notNull().default(0) });

export type Client = typeof clients.$inferSelect;
export type ClientSession = typeof clientSessions.$inferSelect;
```

In `registrations`, `requests` and `subscribers` add (declare `clients` before them or use the lazy reference as shown):

```ts
clientId: integer("client_id").references((): AnyPgColumn => clients.id, { onDelete: "set null" }),
```

and an index on `client_id` for `registrations` and `requests` plus `index("registrations_email_lower").on(sql\`lower(${t.email})\`)`.

- [ ] **Step 4: Generate the migration** — `cd app && npx drizzle-kit generate --name client_accounts`. Open the SQL: it must contain `ALTER TYPE "public"."request_kind" ADD VALUE 'change_request';`, the seven `CREATE TABLE`s, the three `ADD COLUMN "client_id"` with `ON DELETE set null`, and the indexes. Nothing may drop or rewrite existing data.

- [ ] **Step 5: Run the test — expect PASS**; then `npx vitest run` (all) and `npx tsc --noEmit --incremental false`.

- [ ] **Step 6: Apply locally only** — `npm run db:migrate` against the local DB (`.dev.vars`/local URL). Do NOT run it against Railway (Task 11, controller).

- [ ] **Step 7: Commit** `feat(db): client accounts schema`.

---

### Task 2: E-mail helpers and client auth core

**Files:**
- Create: `app/src/domain/email.ts`, `app/src/server/client-auth.ts`
- Test: `app/tests/unit/email.test.ts`, `app/tests/db/client-auth.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; `newToken()`, `sha256(value)`, `isTokenShape(value)` from `src/server/token.ts`; `Db`, `Q` from `src/db/client.ts`.
- Produces:
  - `normalizeEmail(raw: string): string`, `isEmail(s: string): boolean`, `fixDomain(domain: string): string | null`, `typoSuggestion(email: string): string | null` (src/domain/email.ts)
  - constants `CLIENT_COOKIE = "__Host-mslab_client"`, `HINT_COOKIE = "mslab_in"`, `LOGIN_TTL_MS = 30 * 60_000`, `CLIENT_SESSION_TTL_MS = 180 * 86_400_000`, `CODE_ATTEMPTS = 5`, `CLIENT_LOGIN_CAP = 3`, `LOGIN_MAIL_DAILY_CAP = 60`
  - `issueClientLogin(db: Db, email: string, now?: Date): Promise<{ token: string; code: string } | null>`
  - `redeemClientLink(db: Db, token: string, now?: Date): Promise<ClientLogin | null>`
  - `redeemClientCode(db: Db, email: string, code: string, now?: Date): Promise<ClientLogin | "wrong" | null>`
  - `type ClientLogin = { sessionRaw: string; clientId: number; locale: "et" | "ru"; isNew: boolean }`
  - `getClientSession(db: Db, raw: string | undefined, now?: Date): Promise<{ clientId: number } | { ended: "replaced" | "logout" | "expired" } | null>`
  - `endClientSession(db: Db, raw: string | undefined, now?: Date): Promise<void>`
  - `reserveLoginMail(db: Q, now?: Date, cap?: number): Promise<boolean>`
  - `linkClientRecords(db: Q, clientId: number, email: string): Promise<void>`

- [ ] **Step 1: Failing unit tests** `tests/unit/email.test.ts`

```ts
import { expect, test } from "vitest";
import { fixDomain, isEmail, normalizeEmail, typoSuggestion } from "@/domain/email";

test("normalise", () => {
  expect(normalizeEmail("  Kati.Tamm@Example.TEST ")).toBe("kati.tamm@example.test");
});
test("shape", () => {
  expect(isEmail("kati@example.test")).toBe(true);
  for (const bad of ["", "kati", "kati@", "@example.test", "kati@example", "kati @example.test"]) expect(isEmail(bad)).toBe(false);
});
// Addresses are built, never written out: the repo's address guard (tests/unit/test-addresses.test.ts) rejects
// real-domain addresses in tracked files, and this repository is public.
const at = (local: string, domain: string) => `${local}@${domain}`;
test("domain fixes", () => {
  expect(fixDomain("gmial.com")).toBe("gmail.com");
  expect(fixDomain("gmail.ee")).toBe("gmail.com");
  expect(fixDomain("hotmial.com")).toBe("hotmail.com");
  expect(fixDomain("mail.ee")).toBeNull();
  expect(fixDomain("gmail.com")).toBeNull();
});
test("typo suggestion keeps the local part", () => {
  expect(typoSuggestion(at("kati", "gmial.com"))).toBe(at("kati", "gmail.com"));
  expect(typoSuggestion(at("kati", "mail.ee"))).toBeNull();
  expect(typoSuggestion("kati")).toBeNull();
});
```

- [ ] **Step 2: Implement `src/domain/email.ts`**

```ts
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

// Common domains and their frequent misspellings (Estonian and Russian users).
const FIX: Record<string, string> = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.ee": "gmail.com", "gnail.com": "gmail.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com", "yandex.r": "yandex.ru", "mail.r": "mail.ru", "inbox.r": "inbox.ru",
};

/** The intended domain when `domain` is a known misspelling, else null. */
export const fixDomain = (domain: string): string | null => FIX[domain.toLowerCase()] ?? null;

/** "Kas mõtlesid …?": the corrected address when the domain is a known misspelling, else null. */
export function typoSuggestion(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fixed = fixDomain(email.slice(at + 1));
  return fixed ? email.slice(0, at + 1) + fixed : null;
}
```

- [ ] **Step 3: Failing DB tests** `tests/db/client-auth.test.ts` (PGlite via `makeTestDb()` from `tests/db/helpers.ts`)

```ts
import { expect, test } from "vitest";
import { makeTestDb } from "./helpers";
import { clients, clientSessions, registrations, requests, mailQuota } from "@/db/schema";
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
  expect(await reserveLoginMail(db, new Date("2026-10-03T10:00:00Z"), 2)).toBe(true);
});
```

Add the helper `insertRegistration(db, email)` at the bottom of the test file (selects the first contact course from the seeded PGlite DB and inserts a `group` registration with `paymentChoice: "half"`).

- [ ] **Step 4: Run — expect FAIL** (module missing).

- [ ] **Step 5: Implement `src/server/client-auth.ts`**

```ts
import { and, count, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Db, Q } from "@/db/client";
import * as schema from "@/db/schema";
import { clientLoginTokens, clients, clientSessions, mailQuota, registrations, requests, subscribers } from "@/db/schema";
import { normalizeEmail } from "@/domain/email";
import { isTokenShape, newToken, sha256 } from "./token";

export const CLIENT_COOKIE = "__Host-mslab_client";
export const HINT_COOKIE = "mslab_in";
export const LOGIN_TTL_MS = 30 * 60_000;
export const CLIENT_SESSION_TTL_MS = 180 * 86_400_000;
export const CODE_ATTEMPTS = 5;
export const CLIENT_LOGIN_CAP = 3;
export const LOGIN_MAIL_DAILY_CAP = 60;
/** Renew the session expiry at most once a day (fewer writes). */
const RENEW_AFTER_MS = 86_400_000;

export type ClientLogin = { sessionRaw: string; clientId: number; locale: "et" | "ru"; isNew: boolean };

const tx = <T>(db: Db, fn: (t: Db) => Promise<T>) =>
  (db as PostgresJsDatabase<typeof schema>).transaction((t) => fn(t as unknown as Db));

/** Six digits, uniform (rejection sampling). */
function sixDigits(): string {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4_294_000_000);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

/** A login for `email` (link token + code), or null when the address already has CLIENT_LOGIN_CAP live logins. */
export async function issueClientLogin(db: Db, email: string, now = new Date()): Promise<{ token: string; code: string } | null> {
  const address = normalizeEmail(email);
  return tx(db, async (t) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${"client-login:" + address}))`);
    await t.delete(clientLoginTokens).where(lt(clientLoginTokens.expiresAt, now));
    const [{ n }] = await t.select({ n: count() }).from(clientLoginTokens)
      .where(and(eq(clientLoginTokens.email, address), isNull(clientLoginTokens.usedAt), gt(clientLoginTokens.expiresAt, now)));
    if (n >= CLIENT_LOGIN_CAP) return null;
    const token = newToken();
    const code = sixDigits();
    const hash = await sha256(token);
    await t.insert(clientLoginTokens).values({
      hash, codeHash: await sha256(`${hash}:${code}`), email: address, expiresAt: new Date(now.getTime() + LOGIN_TTL_MS),
    });
    return { token, code };
  });
}

/** Creates the client if new, ends its other sessions, links its records and starts a session. */
async function startSession(t: Db, address: string, now: Date): Promise<ClientLogin> {
  const [existing] = await t.select().from(clients).where(eq(clients.email, address)).limit(1);
  const client = existing ?? (await t.insert(clients).values({ email: address }).returning())[0];
  await t.update(clientSessions).set({ endedAt: now, endReason: "replaced" })
    .where(and(eq(clientSessions.clientId, client.id), isNull(clientSessions.endedAt)));
  const sessionRaw = newToken();
  await t.insert(clientSessions).values({
    idHash: await sha256(sessionRaw), clientId: client.id, createdAt: now, expiresAt: new Date(now.getTime() + CLIENT_SESSION_TTL_MS),
  });
  await linkClientRecords(t, client.id, address);
  return { sessionRaw, clientId: client.id, locale: client.locale, isNew: !existing };
}

export async function redeemClientLink(db: Db, token: string, now = new Date()): Promise<ClientLogin | null> {
  if (!isTokenShape(token)) return null;
  return tx(db, async (t) => {
    const [row] = await t.update(clientLoginTokens).set({ usedAt: now })
      .where(and(eq(clientLoginTokens.hash, await sha256(token)), isNull(clientLoginTokens.usedAt), gt(clientLoginTokens.expiresAt, now),
        lt(clientLoginTokens.attempts, CODE_ATTEMPTS)))
      .returning();
    return row ? startSession(t, row.email, now) : null;
  });
}

/** The session for a right code; "wrong" (attempts counted on every live token of the address); null when none is live. */
export async function redeemClientCode(db: Db, email: string, code: string, now = new Date()): Promise<ClientLogin | "wrong" | null> {
  const address = normalizeEmail(email);
  if (!/^\d{6}$/.test(code)) return "wrong";
  return tx(db, async (t) => {
    const live = await t.select().from(clientLoginTokens)
      .where(and(eq(clientLoginTokens.email, address), isNull(clientLoginTokens.usedAt), gt(clientLoginTokens.expiresAt, now),
        lt(clientLoginTokens.attempts, CODE_ATTEMPTS)));
    if (!live.length) return null;
    for (const row of live) {
      if ((await sha256(`${row.hash}:${code}`)) === row.codeHash) {
        await t.update(clientLoginTokens).set({ usedAt: now }).where(eq(clientLoginTokens.hash, row.hash));
        return startSession(t, address, now);
      }
    }
    await t.update(clientLoginTokens).set({ attempts: sql`${clientLoginTokens.attempts} + 1` })
      .where(and(eq(clientLoginTokens.email, address), isNull(clientLoginTokens.usedAt)));
    return "wrong";
  });
}

export async function getClientSession(db: Db, raw: string | undefined, now = new Date()) {
  if (!isTokenShape(raw)) return null;
  const idHash = await sha256(raw);
  const [row] = await db.select().from(clientSessions).where(eq(clientSessions.idHash, idHash)).limit(1);
  if (!row) return null;
  if (row.endedAt) return { ended: row.endReason ?? "logout" } as const;
  if (row.expiresAt <= now) return { ended: "expired" } as const;
  if (row.expiresAt.getTime() - now.getTime() < CLIENT_SESSION_TTL_MS - RENEW_AFTER_MS) {
    await db.update(clientSessions).set({ expiresAt: new Date(now.getTime() + CLIENT_SESSION_TTL_MS) }).where(eq(clientSessions.idHash, idHash));
  }
  return { clientId: row.clientId } as const;
}

export async function endClientSession(db: Db, raw: string | undefined, now = new Date()): Promise<void> {
  if (!isTokenShape(raw)) return;
  await db.update(clientSessions).set({ endedAt: now, endReason: "logout" })
    .where(and(eq(clientSessions.idHash, await sha256(raw)), isNull(clientSessions.endedAt)));
}

/** One more login e-mail today, unless `cap` is reached (the row cannot fail open like KV). */
export async function reserveLoginMail(db: Q, now = new Date(), cap = LOGIN_MAIL_DAILY_CAP): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const rows = await db.insert(mailQuota).values({ day, sent: 1 })
    .onConflictDoUpdate({ target: mailQuota.day, set: { sent: sql`${mailQuota.sent} + 1` }, setWhere: sql`${mailQuota.sent} < ${cap}` })
    .returning();
  return rows.length > 0;
}

/** Links registrations, requests (payload e-mail) and the newsletter row of `email` to the client. */
export async function linkClientRecords(db: Q, clientId: number, email: string): Promise<void> {
  const address = normalizeEmail(email);
  await db.update(registrations).set({ clientId }).where(and(isNull(registrations.clientId), sql`lower(${registrations.email}) = ${address}`));
  await db.update(requests).set({ clientId }).where(and(isNull(requests.clientId), sql`lower(${requests.payload}->>'email') = ${address}`));
  await db.update(subscribers).set({ clientId }).where(and(isNull(subscribers.clientId), sql`lower(${subscribers.email}) = ${address}`));
}
```

- [ ] **Step 6: Run both test files — expect PASS**; full `npx vitest run`, `tsc`.
- [ ] **Step 7: Commit** `feat(accounts): e-mail login codes, one-device sessions, record linking`.

---

### Task 3: Account API — login, code, verify, logout, me (+ login e-mail)

**Files:**
- Create: `app/src/server/account-api.ts`, `app/src/server/account-mail.ts`, `app/src/worker/account-front.ts`, `app/src/app/api/konto/[[...path]]/route.ts`
- Modify: `app/worker.ts` (account front before the page front), `app/src/lib/site-routing.ts` (`/api/konto` already matches `API`; nothing else), `app/src/i18n/dict/et.ts`, `ru.ts` (`account.mail.*`)
- Test: `app/tests/unit/account-api.test.ts`, `app/tests/db/account-api.test.ts`

**Interfaces:**
- Consumes: Task 2 exports; `rateLimit`, `rateKey`, `clientIp` (src/server/ratelimit.ts); `sendMail(env, mail)`, `type Env` (src/server/notify.ts); `isCrossSite(request)` (src/server/auth.ts); `isLocalHost` (src/server/site.ts); `logFailure` (src/server/log.ts).
- Produces:
  - `type AccountDeps = { db: Db; env: Env & { KV: KVNamespace }; now: Date; siteUrl: string; waitUntil: (p: Promise<unknown>) => void; dev: boolean }`
  - `handleAccountApi(request: Request, deps: AccountDeps): Promise<Response | null>` — `null` when the path is not `/api/konto/…`
  - `accountResponse(body: unknown, status?: number, cookies?: string[]): Response` (JSON, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`)
  - `sessionCookies(raw: string): string[]`, `clearedCookies(): string[]`
  - `loginMail(siteUrl: string, email: string, token: string, code: string, locale: "et"|"ru"): Mail`
  - `accountAnswer(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response | null>` (src/worker/account-front.ts — creates a postgres client from `env.HYPERDRIVE.connectionString` with the same options as `src/db/client.ts`, calls `handleAccountApi`, then `ctx.waitUntil(sql.end({ timeout: 5 }))`).

Endpoints (all JSON, all `no-store`):

| Method + path | Body / query | Success | Errors |
|---|---|---|---|
| POST `/api/konto/login` | `{ email, locale }` | `{ ok: true }` (+ `devCode`, `devLink` when `deps.dev`) — same answer for unknown, capped or daily-capped addresses | 400 `{ error: "email" }`; 429 `{ error: "rate" }` (KV `rl:client-login:<ip>`, 10 per 10 min) |
| POST `/api/konto/code` | `{ email, code }` | `{ ok: true, locale }` + cookies | 400 `{ error: "code" }` (wrong), 400 `{ error: "expired" }` (none live); KV `rl:client-code:<ip>` 20 per 10 min |
| GET `/api/konto/verify?t=` | — | 303 → `/konto` or `/ru/konto` + cookies | 303 → `/konto/sisene?viga=link` |
| POST `/api/konto/logout` | — | `{ ok: true }` + cleared cookies | — |
| GET `/api/konto/me` | — | `{ ok: true, email, name }` | 401 `{ reason: "none" | "replaced" | "logout" | "expired" }` (+ cleared hint cookie) |

- [ ] **Step 1: Failing unit tests** (`tests/unit/account-api.test.ts`): path not under `/api/konto` → `null`; cross-site POST → 403; `sessionCookies("x")` contains `__Host-mslab_client=x; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax` and `mslab_in=1; Path=/; Max-Age=15552000; Secure; SameSite=Lax`; `clearedCookies()` sets both with `Max-Age=0`; every response has `cache-control: no-store` and `x-robots-tag: noindex, nofollow`; `loginMail(...)` subject contains the 6-digit code, text contains the code and `${siteUrl}/api/konto/verify?t=` + token, ET and RU variants.

- [ ] **Step 2: Failing DB tests** (`tests/db/account-api.test.ts`, PGlite + an in-memory KV fake with `get/put`): login → `devCode` returned in dev, a token row exists, `sendMail` not called in dev (pass a spy env without `RESEND_API_KEY`); code with that `devCode` → 200 and two `Set-Cookie`; `/me` with the cookie → `{ ok: true, email }`; second login+code from "another device" → first cookie's `/me` → 401 `{ reason: "replaced" }`; verify with a bad token → 303 to `/konto/sisene?viga=link`; daily cap 0 → login still `{ ok: true }` but no mail queued.

- [ ] **Step 3: Implement** `account-mail.ts` (texts from `account.mail` in the dicts: subject `"{code} — MS LAB sisselogimiskood"` / RU `"{code} — код входа MS LAB"`; body: greeting, the code on its own line, the button link, "Kood ja link kehtivad 30 minutit.", "Kui sa ei palunud sisselogimist, võid selle kirja kustutada."), then `account-api.ts`:

```ts
export async function handleAccountApi(request: Request, deps: AccountDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/konto(\/.*)?$/);
  if (!m) return null;
  const path = m[1] ?? "/";
  if (request.method !== "GET" && request.method !== "HEAD" && isCrossSite(request)) return accountResponse({ ok: false }, 403);
  try {
    switch (`${request.method} ${path}`) {
      case "POST /login": return await login(request, deps);
      case "POST /code": return await code(request, deps);
      case "GET /verify": return await verify(url, deps);
      case "POST /logout": return await logout(request, deps);
      case "GET /me": return await me(request, deps);
      default: return dataRoute(request, path, deps); // Task 3: a stub answering 404 { ok: false }; Task 4 fills it
    }
  } catch (e) {
    logFailure("[account] request failed", e);
    return accountResponse({ ok: false, error: "server" }, 500);
  }
}
```

`login`: parse JSON `{ email, locale }`; `isEmail(normalizeEmail(email))` else 400; KV rate limit by `clientIp(request.headers)` (`rateKey("client-login", ip)`); `issueClientLogin`; when a login was issued and `!deps.dev`: `if (await reserveLoginMail(deps.db, deps.now)) deps.waitUntil(sendMail(deps.env, loginMail(...)))`, else `logFailure("[account] daily login mail cap reached", null)`; answer `{ ok: true }` (+ `devCode`, `devLink` when `deps.dev`). `deps.dev` is computed by the callers as `process.env.NODE_ENV !== "production" && isLocalHost(host)` — exactly the admin rule.

`me`: read the cookie from `request.headers.get("cookie")` (parse `__Host-mslab_client=`), `getClientSession`; on success load `{ email, name }` from `clients`.

- [ ] **Step 4: Mount it twice.**
  - `src/app/api/konto/[[...path]]/route.ts`: `export const dynamic = "force-dynamic";` and `GET`/`POST`/`PATCH` that build deps from `getCloudflareContext()` + `getDb()` + `after` and return `(await handleAccountApi(request, deps)) ?? new Response("Not found", { status: 404 })`.
  - `src/worker/account-front.ts` + `worker.ts`: call `accountAnswer(request, env, ctx)` right after `mediaAnswer` and before `runAsRequest`; a non-null answer is returned as is.
- [ ] **Step 5: Tests PASS** (unit, DB, full vitest, tsc, lint).
- [ ] **Step 6: Commit** `feat(accounts): login API with code and link, one-device cookies`.

---

### Task 4: Account data API and the next-step model

**Files:**
- Create: `app/src/domain/account-cards.ts`, `app/src/server/client-data.ts`
- Modify: `app/src/server/account-api.ts` (`dataRoute`), `app/src/server/account-mail.ts` (+ `deletionMail(email, locale)`: "Sinu MS LAB konto on kustutatud." — registrations stay with Maria), dicts (`account.next.*`), `app/src/server/messages.ts` (+ `changeRequestSummary`)
- Test: `app/tests/unit/account-cards.test.ts`, `app/tests/db/client-data.test.ts`, extend `tests/db/account-api.test.ts`

**Interfaces:**
- Consumes: Task 2/3; `registrationPrice(course, kind)`, `prepaymentDue(cents, choice)` (src/domain/registration.ts); `formatEUR` (src/domain/money.ts); `upcomingFrom(now)` (src/domain/calendar.ts); `notifyMaria` (src/server/notify.ts); `getSettings(db)` (src/db/queries/public.ts).
- Produces:
  - `type PrepaymentInfo = { receiver: string; iban: string; bank: string; referencePrefix: string }` (settings key `"prepayment"`; empty strings when unset)
  - `type AccountCard` (discriminated union, see below) and `nextStep(card: AccountCard, now: Date, pay: PrepaymentInfo | null): NextStep`
  - `type NextStep = { key: NextStepKey; vars: Record<string, string>; action: { kind: "pay" | "openCourse" | "changeRequest" | "none"; slug?: string; registrationId?: number } }`
  - `loadDashboard(db: Db, clientId: number, now: Date): Promise<Dashboard>` with `Dashboard = { client: { email: string; name: string; phone: string; locale: "et"|"ru"; newsletter: boolean }; cards: AccountCard[]; favourites: string[]; prepayment: PrepaymentInfo | null }`
  - `loadEcourse(db: Db, clientId: number, slug: string, now: Date): Promise<EcourseView | null>`
  - mutations: `setFavourite(db, clientId, slug, on)`, `mergeFavourites(db, clientId, slugs)`, `updateProfile(db, clientId, { name, phone, locale })`, `setNewsletter(db, clientId, on, now)`, `createChangeRequest(db, clientId, registrationId, kind: "cancel" | "change", message)`, `acceptTerms(db, clientId, slug, now)`, `deleteClient(db, clientId)`

`AccountCard` kinds and next steps (one sentence + at most one button):

| Card | Condition | `key` (ET text) | action |
|---|---|---|---|
| `contact` | cancelled | `cancelled` "Registreering on tühistatud." | none |
| `contact` | session start < now | `done` "Koolitus on toimunud. Aitäh!" | none |
| `contact` | awaiting, prepayment info set | `pay` "Koha kinnitamiseks tasu ettemaks {amount}." | pay |
| `contact` | awaiting, no prepayment info | `invoice` "Maria saadab sulle arve ettemaksu tasumiseks." | none |
| `contact` | confirmed, rest > 0 | `confirmedRest` "Koht on kinnitatud. Ülejäänud {rest} tasud koolituspäeval." | changeRequest |
| `contact` | confirmed, paid in full | `confirmed` "Koht on kinnitatud. Kohtume {date} kell {time}, {city}." | changeRequest |
| `individual` (registration without session) | any | `individualPending` "Maria võtab sinuga ühendust, et aeg kokku leppida." | none |
| `request` (practice/individual request) | handled false/true | `requestNew` "Päring on saadetud. Maria vastab peagi." / `requestDone` "Maria on päringule vastanud." | none |
| `waitlist` | — | `waitlist` "Oled ootenimekirjas. Anname teada, kui koht vabaneb." | none |
| `ecourse` | access expired/revoked | `accessEnded` "Ligipääs on lõppenud." | none |
| `ecourse` | active | `openCourse` "Ligipääs kuni {date}." | openCourse |

`amount` = `prepaymentDue(registrationPrice(course, kind), paymentChoice) - paidCents` formatted with `formatEUR`; `rest` = `registrationPrice - paidCents`. Dates/times in Europe/Tallinn.

- [ ] **Step 1: Failing unit tests for `nextStep`** — one test per table row above (11 cases), plus: amount uses `half` → ceil(price/2) − paid; RU locale formatting is not the model's job (vars are raw strings formatted by the caller — pass a formatter in or format in the component; choose one and test it).
- [ ] **Step 2: Implement `account-cards.ts`** (pure; no DB, no React).
- [ ] **Step 3: Failing DB tests for `client-data.ts`**: dashboard lists the client's registrations, requests (incl. waitlist) and active e-course access, newest session first, past last; favourites by slug (unpublished courses excluded); `mergeFavourites` ignores unknown slugs and duplicates; `setNewsletter(on)` creates a **confirmed** subscriber for the account e-mail (login proved the address), `off` deletes it; `createChangeRequest` refuses another client's registration (returns false) and inserts `{ kind: "change_request", payload: { registrationId, kind, message, email }, clientId }`; `acceptTerms` stores the current `course_terms` version (= `pages.course_terms` updated timestamp or the string `"1"` when the page has no timestamp column — store a `version` field in the page JSON body; read it back in `loadEcourse`); `deleteClient` deletes the client (cascade) and leaves its registrations with `clientId = null` and their name/e-mail untouched, and deletes the newsletter subscriber of that e-mail.
- [ ] **Step 4: Implement `client-data.ts`** — `loadDashboard` runs its queries with `Promise.all` (registrations+sessions+courses join; requests by client; course_access+courses; favourites+courses; client row; settings `prepayment`). Keep it to these six small queries.
- [ ] **Step 5: Wire `dataRoute`** in `account-api.ts` (all require a live session; else 401 `{ reason }` with the hint cookie cleared):

| Method + path | Body | Result |
|---|---|---|
| GET `/api/konto` | — | `Dashboard` |
| GET `/api/konto/kursus/:slug` | — | `EcourseView` or 404 |
| POST `/api/konto/lemmikud` | `{ slug, on }` | `{ ok, favourites }` |
| POST `/api/konto/lemmikud/merge` | `{ slugs }` | `{ ok, favourites }` |
| PATCH `/api/konto/andmed` | `{ name, phone, locale }` (name ≤ 120, phone ≤ 40, locale et/ru) | `{ ok }` |
| POST `/api/konto/uudiskiri` | `{ on }` | `{ ok }` |
| POST `/api/konto/muutmine` | `{ registrationId, kind, message }` (message ≤ 1000) | `{ ok }`; `deps.waitUntil(notifyMaria(...changeRequestSummary...))` |
| POST `/api/konto/tingimused` | `{ slug }` | `{ ok }` |
| POST `/api/konto/kustuta` | `{ confirm: true }` | `{ ok }` + cleared cookies; deletion e-mail queued |

- [ ] **Step 6: Tests PASS; commit** `feat(accounts): dashboard data, favourites, profile, change requests, terms, deletion`.

---

### Task 5: Login page, header state and the signed-out-elsewhere flow

**Files:**
- Create: `app/src/app/[locale]/(site)/konto/sisene/page.tsx`, `app/src/components/account/LoginForm.tsx` (+ `.module.css`), `app/src/components/account/useAccount.ts`
- Modify: `app/src/lib/site-routing.ts` (`STATIC_PAGES` + `/konto/sisene`, `/konto/lemmikud`, `/konto/andmed`; `SLUG_PAGE` + `konto/kursus/<slug>`), `app/src/components/site/Header.tsx` (account link), dicts `account.login.*`, `account.signedOut.*`
- Test: `app/tests/unit/site-routing.test.ts` (new routes known), `app/tests/e2e/account-login.spec.ts`, `app/tests/e2e/account.ts` (helpers)

**Interfaces:**
- Consumes: Task 3 endpoints.
- Produces:
  - `useAccount<T>(path: string): { state: "loading" | "ready" | "signedOut" | "replaced" | "error"; data: T | null; reload(): void }` — fetches `/api/konto…` with `credentials: "same-origin"`; 401 `replaced` → `"replaced"`, other 401 → `"signedOut"` (and the hook redirects to the login page unless the caller opts out).
  - `hasAccountHint(): boolean` — reads `document.cookie` for `mslab_in=1`.
  - e2e helpers `signInAsClient(page: Page, email: string): Promise<void>` (inserts a token row with a known raw token directly into the local DB via `onLocalDb`, then opens `/api/konto/verify?t=`) and `clientEmail(label: string, project: string): string` → `e2e-client-<label>-<project>@example.test`; cleanup in global setup/teardown removes `e2e-client-%@example.test` clients, tokens, sessions.

Behaviour (spec 2.1 rules 1, 3, 4, 8):
1. Field "E-post" pre-filled from `localStorage["mslab-email"]` (try/catch); button "Saada kood". On submit: trim + lowercase; `typoSuggestion` → inline "Kas mõtlesid {fixed}?" with two buttons ("Jah, paranda" / "Ei, saada nii"); then POST `/api/konto/login`; store the e-mail in localStorage.
2. Step two replaces the form: "Saatsime 6-kohalise koodi aadressile {email}." + one code field (`inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength=6`, auto-submit at 6 digits) + "Saada uuesti" (enabled after 60 s) + "Muuda e-posti".
3. Wrong code → "Kood ei sobi. Proovi uuesti." (field cleared, focus kept). Expired → "Kood on aegunud. Saada uus kood." with the resend button focused.
4. Success → `location.assign(locale === "ru" ? "/ru/konto" : "/konto")`.
5. `?viga=link` → banner "Link on aegunud või juba kasutatud. Saada uus kood." with the form pre-filled.
6. `?korda=1` (from the replaced message) → the code is sent immediately for the remembered e-mail and step two is shown.
7. Header: when `hasAccountHint()` the "Logi sisse" link becomes "Minu konto" → `/konto` (client-side, after hydration; no request).

- [ ] **Step 1: Unit test for routing** (`/et/konto/sisene`, `/et/konto/lemmikud`, `/et/konto/andmed`, `/et/konto/kursus/kulmude-lami` are known pages; `/et/konto/x/y` is not).
- [ ] **Step 2: E2E first** (`tests/e2e/account-login.spec.ts`, desktop + mobile): request code (dev response gives `devCode`) → type it → lands on `/konto`; wrong code message; typo suggestion for `@gmial.com` corrects the field; pre-fill on second visit; `?viga=link` banner; header shows "Minu konto" after login and "Logi sisse" after logout; two browser contexts: login in B → A's next `/konto` load shows "Sinu konto avati teises seadmes" with "Saada uus kood" → login page in code step.
- [ ] **Step 3: Implement**, run unit + the new e2e (both projects) + full e2e.
- [ ] **Step 4: Commit** `feat(accounts): login page with code, header account link`.

---

### Task 6: "Minu koolitused" dashboard and the tab bar

**Files:**
- Create: `app/src/components/account/AccountShell.tsx` (+ css; tabs Minu koolitused · Lemmikud · Minu andmed; avatar menu with "Logi välja"; phone: sticky bottom bar with icon + label, ≥ 44 px targets; look taken from prototype B's dashboard and the site's tokens), `AccountCourseCard.tsx`, `NextStepLine.tsx`, `PrepaymentInfo.tsx`, `ChangeRequestDialog.tsx`, `CardSkeleton.tsx`
- Modify: `app/src/app/[locale]/(site)/konto/page.tsx` (replace the placeholder with `<AccountShell tab="courses"><CoursesTab/></AccountShell>`), dicts `account.dashboard.*`
- Test: `app/tests/e2e/account-dashboard.spec.ts`, `app/tests/unit/account-cards.test.ts` (formatting helper if added)

**Interfaces:**
- Consumes: `useAccount<Dashboard>("/api/konto")`, `nextStep`, `AccountCard`, `PrepaymentInfo` (Task 4).
- Produces: `<AccountShell tab readOnly? banner?>` and `<CoursesTab data readOnly?>` — both accept `readOnly` (Task 9 view-as renders them with server data and every button disabled).

Behaviour:
- Greeting "Tere, {first name}!" (or "Tere!" without a name), one line "Siin on sinu koolitused." — no other intro text.
- Filter chips: Kõik · Tulevased · Möödunud (only shown when there are ≥ 2 cards).
- Each card: course title, a small type tag (Kontaktõpe / E-õpe / Päring / Ootenimekiri), date/time/city for sessions, the next-step sentence, at most one primary button:
  - `pay` → expands `PrepaymentInfo` in place: receiver, IBAN (with "Kopeeri"), bank, amount, reference `{referencePrefix}{registrationId}` (with "Kopeeri"), and "Pärast makset kinnitab Maria su koha.";
  - `changeRequest` → `ChangeRequestDialog`: two choices "Soovin tühistada" / "Soovin muuta aega", optional message, "Saada" → POST `/api/konto/muutmine` → "Saadetud. Maria võtab sinuga ühendust.";
  - `openCourse` → link to `/konto/kursus/{slug}`.
- Phones: cards in a horizontal swipeable list when there are ≥ 2 upcoming cards (scroll-snap + touch swipe; reduced motion = no smooth scroll); desktop: grid.
- Empty state: "Sul ei ole veel koolitusi." + one button "Vaata koolitusi" → `/koolitused`.
- Loading: 2 skeleton cards. Errors: "Ei õnnestunud laadida. Proovi uuesti." + "Proovi uuesti" button.

- [ ] **Step 1: E2E first** — sign in as a client that has: one awaiting (half) registration, one confirmed paid-in-full registration (future), one cancelled, one practice request, one waitlist entry, one active e-course access (insert fixtures directly). Assert each card's sentence and single button; the pay panel shows the IBAN and reference from a seeded `prepayment` setting; without the setting the card says "Maria saadab sulle arve…"; change request reaches the admin inbox (`/admin/paringud` shows it — sign in as admin via `signInAsAdmin`); swipe on mobile moves to the next card (CDP touch, like `tests/e2e/swipe.spec.ts`); bottom tab bar visible at 390 px, top tabs at 1440 px; no horizontal overflow at 390/834/1440/2560.
- [ ] **Step 2: Implement; run; commit** `feat(accounts): Minu koolitused dashboard`.

---

### Task 7: E-course page with the terms notice

**Files:**
- Create: `app/src/app/[locale]/(site)/konto/kursus/[slug]/page.tsx`, `app/src/components/account/TermsGate.tsx`, `EcourseView.tsx`
- Modify: `app/src/db/seed-data.ts` (+ `pages.course_terms` ET/RU default text, body JSON includes `version: "1"`), `app/src/server/admin-site.ts` + `app/src/components/admin/*` Seaded legal-pages editor (add "E-koolituse tingimused" next to privacy/terms; saving bumps `version` to the save time ISO string), dicts `account.ecourse.*`
- Test: `app/tests/e2e/account-ecourse.spec.ts`, extend `tests/db/client-data.test.ts`

**Behaviour (spec S5/C54):**
- Without access → "Sul ei ole sellele koolitusele ligipääsu." + "Vaata koolitust" → public course page.
- With access, terms for the current version not accepted → a full-width notice (not a dismissable modal): title "Enne alustamist", the `course_terms` text, one checkbox "Olen tutvunud ja nõustun tingimustega" and one button "Alusta koolitust" (disabled until checked) → POST `/api/konto/tingimused` → the course view.
- Course view: title, "Ligipääs kuni {date}", the module list (locked icons as on the public page), and "Sisu lisandub peagi." — nothing else.
- Admin changes the terms text → version changes → the notice shows again on next open.

- [ ] Steps: e2e first (no access / gate / accept / re-gate after admin edit), implement, run, commit `feat(accounts): e-course page with terms notice`.

---

### Task 8: Lemmikud, favourites merge, Minu andmed

**Files:**
- Create: `app/src/app/[locale]/(site)/konto/lemmikud/page.tsx`, `konto/andmed/page.tsx`, `app/src/components/account/FavouritesTab.tsx`, `DetailsTab.tsx`
- Modify: `app/src/components/site/FavouriteButton.tsx` (account mode), `app/src/lib/favourites.ts` (merge helpers), dicts `account.favourites.*`, `account.details.*`
- Test: `app/tests/unit/favourites.test.ts`, `app/tests/e2e/account-favourites.spec.ts`, `app/tests/e2e/account-details.spec.ts`

**Behaviour:**
- After the first successful dashboard load in a browser that has `localStorage["mslab-fav"]`, POST `/api/konto/lemmikud/merge` once, then clear the local list (only after a 200).
- `FavouriteButton`: when `hasAccountHint()` → reads the state from the dashboard data cached in `sessionStorage` (`mslab-account-fav`, refreshed on dashboard load) and toggles via POST `/api/konto/lemmikud`; on 401 falls back to the browser list. Label/`aria-pressed` behaviour unchanged.
- Lemmikud: course cards (public `CourseCard`) with ♡ to remove; empty state "Lisa koolitus lemmikuks ♡ koolituse lehel." + "Vaata koolitusi".
- Minu andmed: name, phone (both optional), language (ET/RU radio; switching also navigates to the same tab in that language), "Saada mulle uudiskirja" switch, "Salvesta"; at the very bottom "Kustuta konto" → confirmation step "Kas kustutame su konto? Sinu registreeringud jäävad Mariale alles." with "Jah, kustuta" / "Tühista" → POST `/api/konto/kustuta` → home page with notice "Konto on kustutatud."

- [ ] Steps: unit tests for merge helpers; e2e first (anonymous favourite → login → it is in Lemmikud and gone from localStorage; toggle in account mode; profile save; newsletter on creates a confirmed subscriber; delete account keeps the registration (admin sees it) and logs out); implement; run; commit `feat(accounts): favourites in the account, my details, account deletion`.

---

### Task 9: Admin — Õpilased, access, view as client, prepayment setting, change requests

**Files:**
- Create: `app/src/server/admin-clients.ts`, `app/src/server/actions/admin-clients.ts`, `app/src/app/admin/(panel)/opilased/page.tsx`, `app/src/app/admin/(panel)/opilased/[id]/vaade/page.tsx`, `app/src/components/admin/ClientDrawer.tsx`
- Modify: `app/src/components/admin/sections.ts` (+ `{ key: "clients", href: "/admin/opilased", icon: "user" }` after registrations), `app/src/i18n/dict/admin.ts`, Seaded (`admin-site.ts` part "prepayment" + editor fields receiver/IBAN/bank/reference prefix), requests inbox (`/admin/paringud` shows `change_request` with a link to the registration), `tests/unit/admin-guards.test.ts` (new action file covered)
- Test: `app/tests/db/admin-clients.test.ts`, `app/tests/e2e/admin-clients.spec.ts`

**Interfaces:**
- Consumes: `loadDashboard` (Task 4), `AccountShell`/`CoursesTab` with `readOnly` (Task 6), guards.
- Produces: `listClients(db, { filter: "all" | "e" | "k"; q: string; page: number })`, `clientDetail(db, id)`, actions `grantCourseAccess` / `revokeCourseAccess` (any admin; `grantedBy` = the admin's e-mail; expiry default now + `accessMonths`, editable date).

**Behaviour:**
- List: name, e-mail, created, number of courses; filter chips Kõik / E-õpe / Kontaktõpe (A4); search; 50 per page (`?leht=`), like the inboxes.
- Drawer: registrations, requests, e-course access (with expiry and who granted it), terms acceptances; buttons "Ava ligipääs" (pick an e-course, date pre-filled) and "Lõpeta ligipääs"; link "Vaata tema vaadet".
- View as: `/admin/opilased/[id]/vaade` — `requireAdmin()`, loads `loadDashboard(getDb(), id, new Date())` on the server and renders `<AccountShell readOnly banner="Vaatad kliendi {nimi} vaadet — muuta ei saa"><CoursesTab data readOnly/></AccountShell>`; every button is `aria-disabled` and does nothing; no client session is created or touched.
- Prepayment setting saved through the existing site-parts engine (stale guard as in 13B); saving revalidates nothing public (data is account-only).

- [ ] Steps: DB tests (filter by course type, search, paging, grant/revoke/expiry, grantedBy recorded), e2e first (admin grants access → client sees the e-course card; view-as shows the same cards with disabled buttons and the client's session still works afterwards; change request appears in Päringud), implement, run guard tests, commit `feat(admin): clients, e-course access and read-only client view`.

---

### Task 10: Registration confirmation e-mails to visitors

**Files:**
- Modify: `app/src/server/submit.ts` (after a stored registration/waitlist/individual/practice request: queue a visitor confirmation in the same `after()` path as Maria's notification), `app/src/server/account-mail.ts` (`registrationConfirmationMail`, `requestConfirmationMail`), dicts `account.mail.*`
- Test: `app/tests/db/actions.test.ts` (extend), `app/tests/unit/account-mail.test.ts`

**Behaviour (spec section 8):**
- Group registration: subject "Registreering on vastu võetud — {course}"; body: course, date/time/city, the next step (prepayment amount + instructions from the `prepayment` setting, or "Maria saadab sulle arve"), "Koht kinnitatakse pärast vähemalt 50% ettemaksu laekumist.", button "Ava minu konto" → `${siteUrl}/konto/sisene?email=<urlencoded>` (pre-fills the field).
- When `wantsAccount` was ticked: the same e-mail also contains a live login code + button (issue via `issueClientLogin`; counts against `reserveLoginMail`; if the cap is reached, the e-mail goes out without the code).
- Individual, practice, waitlist: short confirmation with "Maria võtab sinuga ühendust." and the same "Ava minu konto" button.
- Language = the registration's locale. Sample/test addresses `@example.test` are never mailed (skip in `sendMail` callers: `if (to.endsWith("@example.test")) return`).
- The login page reads `?email=` once to pre-fill (then removes it from the address bar).

- [ ] Steps: unit tests for the mail texts (ET/RU, with and without prepayment info, with and without code); DB tests: registration with `wantsAccount` creates a login token, without it creates none, `@example.test` is never sent; implement; full suites; commit `feat(accounts): confirmation e-mails with the account button`.

---

### Task 11: Migration on Railway, deploy and Free-plan acceptance (controller)

**Files:**
- Modify: `app/tools/cache-smoke.mjs` (+ read-only `/konto`, `/ru/konto`, `/konto/sisene` shell checks: served from the front)
- Create: `app/tools/account-cpu.md` (how the CPU numbers were measured and the results)

- [ ] **Step 1 (controller):** apply `drizzle/0001_client_accounts.sql` to Railway with `npm run db:migrate` and the Railway URL (additive migration; verify with a read-only `\d clients`).
- [ ] **Step 2:** deploy (`npm run deploy`, secrets already set; keep `routes`, `workers_dev`, `preview_urls`, pins).
- [ ] **Step 3:** `wrangler tail mslab-web --format json` while the controller signs in as a client on https://mslab.diipsolutions.eu and opens every tab 10 times: every `/api/konto*` event ≤ 8 ms CPU (record max/median per endpoint in `tools/account-cpu.md`); `/konto*` shells answered by the front (`x-page-cache: front`, 0–2 ms).
- [ ] **Step 4:** `node tools/cache-smoke.mjs` PASS; remote read-only e2e + visual green (1–2 workers).
- [ ] **Step 5:** live check with a sample client (`@example.test` sample data): admin "Ava ligipääs" → client sees the e-course; view-as shows the same; change request lands in Päringud; delete the test client afterwards.
- [ ] **Step 6:** commit `chore(accounts): Free-plan acceptance numbers`; push.
