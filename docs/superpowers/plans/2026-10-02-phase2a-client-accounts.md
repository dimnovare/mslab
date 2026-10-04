# MS LAB Phase 2a — Client Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students log in with an e-mail code or link and see "Minu koolitused", their favourites and their details; admins grant e-course access and can view any client's screen read-only — all inside Vercel Hobby.

**Architecture:** Client pages (`/konto…`) are static shells that Vercel's CDN serves like the other public pages (ISR), without a page render per visit; all personal data comes from a small JSON API (`/api/konto/*`). The API is one ordinary Next route handler (`app/api/konto/[[...path]]/route.ts`) that builds its dependencies (the app's Postgres pool `getDb()`, `serverEnv()`, the Postgres-backed KV store `serverKv()` for rate limits, `after()` for e-mail) and hands the request to a framework-free router `handleAccountApi(request, deps)`, which the DB tests drive without Next. Sessions are one-device-only rows in Postgres; login uses a 6-digit code plus a link from one token.

**Tech Stack:** Next.js 16.3.8 (pinned exactly — do not upgrade), React 19, TypeScript, Drizzle 0.45 + postgres.js 3.4 (Railway over its TCP proxy, one pool per function instance), PGlite for DB tests, Vitest, Playwright, Resend, rate limits in Postgres `kv_entries`. Hosting: Vercel project `mslab` on the Hobby plan, functions in `fra1` (`docs/deploy.md`).

**Spec:** `docs/superpowers/specs/2026-10-02-phase2a-client-accounts-design.md` — read sections 2, 2.1 (simplicity rules, binding) and the section your task names before starting.

## Global Constraints

- **Vercel Hobby** (paid plans are ruled out). Limits that bind 2a: **1M function invocations a month**, **4.5 MB request body**, **cron jobs at most daily** (2a adds no cron: the existing daily `/api/cron/sweep` also deletes expired login tokens, sessions over for 30 days and `mail_quota` rows older than 7 days — `sweepClientRows` in `client-auth.ts`; the `rl:client-*` rate-limit rows go by their TTL put), **100 GB data transfer**. Resend Free stays at **100 mails/day**, shared with the form notifications — hence the 60/day login-mail cap (`LOGIN_MAIL_DAILY_CAP`) and 30/day for visitor confirmations without a code (`CONFIRMATION_MAIL_DAILY_CAP`, Task 10).
- **`/konto…` pages are static shells.** On the server they must not read cookies, headers, `searchParams` or anything else per request (no `cookies()`, `headers()`, `connection()`, no `searchParams` prop). Their parameters are fragments (`#viga`, `#korda`, `#email`, `#kood`, `#valja`, `#sisse`, `#salvestatud`, `#konto-kustutatud`), read in the browser (`location.hash` in an effect; no `useSearchParams`) and then removed; app links never put a query on a shell (guard test), and the middleware answers any query on a shell with a 303 to the same path, `viga`/`korda`/`email`/`kood` moved into the fragment, `no-store` (Next bakes a regenerating request's query into the cached page). Reason: Vercel's CDN then serves them without rendering — no page function invocation per visit — and no personal data can ever enter a shared cache. Check: `next build` lists every `/[locale]/konto…` route as prerendered (● / ○), never ƒ (Dynamic); the local `E2E_PROD_BUILD=1` cache spec answers them from the cache with no `Set-Cookie` (Task 5).
- **All personal data comes from `/api/konto/*` JSON** with `Cache-Control: private, no-store`. Each call runs a few small indexed queries, in parallel (`Promise.all`) where independent, and no React rendering. The route uses the app's one Postgres pool (`getDb()` from `src/db/client.ts`): never create or `end()` a client per request (an ended client makes every later query, `after()` work included, fail with CONNECTION_ENDED).
- Simplicity rules (spec 2.1) bind every screen and e-mail: 6-digit code **and** button in the login e-mail; code/link valid **30 minutes**, single use, 5 wrong code tries kill the token; session **180 days**, renewed on use; **one device**: a new login ends all other sessions (`end_reason = 'replaced'`); "Sinu konto avati teises seadmes" + one button "Saada uus kood"; no passwords, no set-up step; every card has one plain next-step sentence and at most one button; e-mail typo suggestion "Kas mõtlesid …?".
- **Design rules (Dim): simple in steps and words, not a new look.** The client area uses prototype B's dashboard (`app/public/p/b/app.js` `dashboard`, `app/public/p/b/styles.css`) as its visual base and the public site's existing components, fonts (Jost/Manrope), colour tokens and button styles (`ui.btn` etc.); touch targets ≥ 44 px (the current rule). Do not introduce new visual styles, colours or components where an existing one fits; reviewers check this.
- Every UI string in `src/i18n/dict/et.ts` and `ru.ts` (parity test stays green); admin strings ET-only in `src/i18n/dict/admin.ts`.
- Cookies: session `__Host-mslab_client` (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 180 days); hint `mslab_in=1` (NOT HttpOnly, Secure, SameSite=Lax, Path=/, same Max-Age) — the hint carries no secret and only lets cached pages show "Minu konto" without a request.
- Every POST/PATCH under `/api/konto/*` is refused with 403 when `isCrossSite(request)` (from `src/server/auth.ts`).
- Admin code: pages call `requireAdmin()`, route handlers use `withAdmin`, server actions are `adminAction(...)` exports in `src/server/actions/admin*.ts` (static guard test `tests/unit/admin-guards.test.ts`).
- No real e-mail addresses anywhere in the repo (guard `tests/unit/test-addresses.test.ts`); tests use `@example.test`. Never use Maria's address in a login context. The GitHub repo is **public**.
- No PII in logs: use `logFailure` from `src/server/log.ts`.
- Mobile first (design at 390 px, check 834/1440/2560); swipe on phones for the course list; `prefers-reduced-motion` respected; no horizontal page overflow.
- Fonts/colours: Jost headings and numbers, Manrope UI; only tokens from `src/styles/tokens.css`.
- **No Railway writes and no deploys before Task 11.** Tests and tools never write to Railway (the e2e run refuses non-local databases, `tests/e2e/local-db.ts`; the db tools need `--target`). Migration `0001_client_accounts.sql` is already applied on Railway (with `0002_kv_entries.sql`); no task adds another. Merging into `main` deploys production (Vercel Git integration), and pushing any other branch makes a preview deployment, so phase 2a stays on `feat/phase2a-client-accounts`, local and unpushed, until Task 11.
- Commits: Conventional Commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; repo-local git user.email stays the GitHub noreply address.

---

## File Structure

```
app/
  drizzle/0001_client_accounts.sql                 (generated, Task 1 — done, applied on Railway)
  src/db/schema.ts                                  (+ client tables, client_id columns, request kind — done)
  src/domain/email.ts                               normalizeEmail, isEmail, typoSuggestion (pure)
  src/domain/account-cards.ts                       card model + nextStep() (pure)
  src/server/client-auth.ts                         tokens, codes, sessions, linking, mail cap (DB)
  src/server/client-data.ts                         dashboard loader + client mutations (DB)
  src/server/account-api.ts                         handleAccountApi(request, deps) router (no Next imports)
  src/server/account-mail.ts                        login / confirmation / deletion e-mail texts
  src/app/api/konto/[[...path]]/route.ts            the Next route handler: builds deps → handleAccountApi
  next.config.ts                                    (+ /api/konto Cache-Control, /api/konto/verify Referrer-Policy)
  src/components/account/*                          client components (tab bar, cards, forms, gates)
  src/app/[locale]/(site)/konto/page.tsx            Minu koolitused shell (replaces the placeholder)
  src/app/[locale]/(site)/konto/sisene/page.tsx     login shell
  src/app/[locale]/(site)/konto/lemmikud/page.tsx   favourites shell
  src/app/[locale]/(site)/konto/andmed/page.tsx     my details shell
  src/app/[locale]/(site)/konto/kursus/[slug]/page.tsx  e-course shell
  src/server/admin-clients.ts, src/server/actions/admin-clients.ts
  src/app/admin/(panel)/opilased/page.tsx, opilased/[id]/vaade/page.tsx
  tests/e2e/cache.spec.ts                           (+ the /konto shells and /api/konto/me, E2E_PROD_BUILD=1)
tools/cache-smoke.mjs                               (repo root; + the /konto shells and /api/konto/me, Task 11)
```

---

### Task 1: Schema and migration

> **Status: DONE** — commit `b21f56f` (review clean). `0001_client_accounts.sql` is applied locally and **already applied on Railway** (together with `0002_kv_entries.sql`). Do not re-apply it. The text below is kept as it was executed (the test as committed inserts its own course: `makeTestDb()` migrates but does not seed).

**Files:**
- Modify: `app/src/db/schema.ts`
- Create: `app/drizzle/0001_client_accounts.sql` (+ `drizzle/meta/*` from drizzle-kit)
- Test: `app/tests/db/schema.test.ts` (extend)

**Interfaces:**
- Produces (exported from `src/db/schema.ts`): tables `clients`, `clientLoginTokens`, `clientSessions`, `courseAccess`, `termsAcceptances`, `clientFavourites`, `mailQuota`; new nullable column `clientId` on `registrations`, `requests`, `subscribers`; `requestKind` gains `"change_request"`; types `Client = typeof clients.$inferSelect`, `ClientSession = typeof clientSessions.$inferSelect`.

- [x] **Step 1: Write the failing test** (append to `tests/db/schema.test.ts`; import `courses` from `@/db/schema` and `eq` from `drizzle-orm` if the file does not yet)

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

- [x] **Step 2: Run it — expect FAIL** (`npx vitest run tests/db/schema.test.ts` → "clients is not exported").

- [x] **Step 3: Add the schema** to `src/db/schema.ts` (change the existing `requestKind` line as shown; add the tables after `subscribers`; add `primaryKey`, `index` and `type AnyPgColumn` to the `drizzle-orm/pg-core` import):

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

- [x] **Step 4: Generate the migration** — `cd app && npx drizzle-kit generate --name client_accounts`. Open the SQL: it must contain `ALTER TYPE "public"."request_kind" ADD VALUE 'change_request';`, the seven `CREATE TABLE`s, the three `ADD COLUMN "client_id"` with `ON DELETE set null`, and the indexes. Nothing may drop or rewrite existing data.

- [x] **Step 5: Run the test — expect PASS**; then `npx vitest run` (all) and `npx tsc --noEmit --incremental false`.

- [x] **Step 6: Apply locally only** — `npm run db:migrate` against the local DB (`.dev.vars`/local URL). Do NOT run it against Railway (Task 11, controller).

- [x] **Step 7: Commit** `feat(db): client accounts schema`.

---

### Task 2: E-mail helpers and client auth core

**Files:**
- Create: `app/src/domain/email.ts`, `app/src/server/client-auth.ts`
- Test: `app/tests/unit/email.test.ts`, `app/tests/db/client-auth.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; `newToken()`, `sha256(value)`, `isTokenShape(value)` from `src/server/token.ts`; `Db`, `Q` from `src/db/client.ts`.
- Produces:
  - `normalizeEmail(raw: string): string`, `isEmail(s: string): boolean`, `fixDomain(domain: string): string | null`, `typoSuggestion(email: string): string | null`, `isSampleAddress(email: string): boolean` (src/domain/email.ts)
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
import { fixDomain, isEmail, isSampleAddress, normalizeEmail, typoSuggestion } from "@/domain/email";

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
test("sample addresses are recognised", () => {
  expect(isSampleAddress("kati.naidis@example.test")).toBe(true);
  expect(isSampleAddress("Kati@Example.TEST")).toBe(true);
  expect(isSampleAddress(at("kati", "example.testing.ee"))).toBe(false);
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

/** Sample and test data (`@example.test`) is never mailed: the domain does not exist, and bounces hurt the sender. */
export const isSampleAddress = (email: string): boolean => normalizeEmail(email).endsWith("@example.test");

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

Add the helper `insertRegistration(db, email)` at the bottom of the test file: `makeTestDb()` migrates but does not seed, so it inserts a contact course of its own first (as the Task 1 test does: `db.insert(courses).values({ slug, type: "contact", level: "basic", title: { et: "…" }, summary: { et: "" }, body: { et: "" } })`), then a `group` registration on it with `paymentChoice: "half"` (no session).

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

/** One more login e-mail today, unless `cap` is reached (the row cannot fail open like the rate limits). */
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
- Create: `app/src/server/account-api.ts`, `app/src/server/account-mail.ts`, `app/src/app/api/konto/[[...path]]/route.ts`
- Modify: `app/next.config.ts` (`headers()`: the `/api/konto` rules below), `app/src/i18n/dict/et.ts`, `ru.ts` (`account.mail.*`). No change in `app/src/lib/site-routing.ts`: `/api/konto` already matches `API`, so the middleware passes it through.
- Test: `app/tests/unit/account-api.test.ts`, `app/tests/db/account-api.test.ts`, `app/tests/unit/next-config.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2 exports; `rateLimit(kv, key, limit, windowSec)`, `rateKey(form, ip)`, `clientIp(headers)` (src/server/ratelimit.ts; `clientIp` reads `x-forwarded-for` and returns `string | null`); `sendMail(env, mail)`, `type Env`, `type Mail` (src/server/notify.ts; `Env` carries the rate-limit store as `KV: TextKv`); `isCrossSite(request)` (src/server/auth.ts); `isLocalHost`, `hostOrigin`, `linkBase` (src/server/site.ts); `logFailure` (src/server/log.ts); in the route only: `getDb()` (src/db/client.ts), `serverEnv()` (src/server/env.ts), `serverKv()` (src/server/kv.ts), `after` (next/server).
- Produces:
  - `type AccountDeps = { db: Db; env: Env; now: Date; siteUrl: string; later: (task: () => Promise<unknown>) => void; dev: boolean }` — the same shape as `LoginDeps` (src/server/login.ts) and the forms' `Deps` (src/server/submit.ts). `env` = `{ ...serverEnv(), KV: serverKv() }`, so `env.KV` (Postgres `kv_entries`) is the rate-limit store; `later` runs work after the response (`after()` in the route; collected and awaited in tests).
  - `handleAccountApi(request: Request, deps: AccountDeps): Promise<Response | null>` — `null` when the path is not `/api/konto/…`
  - `accountResponse(body: unknown, status?: number, cookies?: string[]): Response` (JSON, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`)
  - `sessionCookies(raw: string): string[]`, `clearedCookies(): string[]`
  - `loginMail(siteUrl: string, email: string, token: string, code: string, locale: "et"|"ru"): Mail`

Endpoints (all JSON, all `private, no-store`):

| Method + path | Body / query | Success | Errors |
|---|---|---|---|
| POST `/api/konto/login` | `{ email, locale }` | `{ ok: true }` (+ `devCode`, `devLink` when `deps.dev`) — same answer for unknown, capped or daily-capped addresses | 400 `{ error: "email" }`; 429 `{ error: "rate" }` (`rl:client-login:<ip>` in the KV store, 10 per 10 min) |
| POST `/api/konto/code` | `{ email, code }` | `{ ok: true, locale }` + cookies | 400 `{ error: "code" }` (wrong), 400 `{ error: "expired" }` (none live); `rl:client-code:<ip>` 20 per 10 min |
| GET `/api/konto/verify?t=` | — | 303 → `/konto#sisse` or `/ru/konto#sisse` + cookies | 303 → `/konto/sisene#viga=link` (`#viga=server` on a database failure) |
| POST `/api/konto/logout` | — | `{ ok: true }` + cleared cookies | — |
| GET `/api/konto/me` | — | `{ ok: true, email, name }` | 401 `{ reason: "none" | "replaced" | "logout" | "expired" }` (+ cleared hint cookie) |

- [ ] **Step 1: Failing unit tests** (`tests/unit/account-api.test.ts`): path not under `/api/konto` → `null`; cross-site POST → 403; `sessionCookies("x")` contains `__Host-mslab_client=x; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax` and `mslab_in=1; Path=/; Max-Age=15552000; Secure; SameSite=Lax`; `clearedCookies()` sets both with `Max-Age=0`; every response has `cache-control: private, no-store` and `x-robots-tag: noindex, nofollow`; `loginMail(...)` subject contains the 6-digit code, text contains the code and `${siteUrl}/api/konto/verify?t=` + token, ET and RU variants. In `tests/unit/next-config.test.ts`: `/api/konto` and `/api/konto/me` get `cache-control` `private, no-store`; `/api/konto/verify` gets `referrer-policy` `no-referrer`, `/api/konto/login` keeps `strict-origin-when-cross-origin`.

- [ ] **Step 2: Failing DB tests** (`tests/db/account-api.test.ts`, PGlite + `fakeKv()` from `tests/fakes.ts`; `later` pushes the tasks and the test awaits them, as `tests/db/login.test.ts` does): login → `devCode` returned in dev, a token row exists, `sendMail` not called in dev (pass a spy env without `RESEND_API_KEY`); code with that `devCode` → 200 and two `Set-Cookie`; `/me` with the cookie → `{ ok: true, email }`; second login+code from "another device" → first cookie's `/me` → 401 `{ reason: "replaced" }`; verify with a bad token → 303 to `/konto/sisene#viga=link`; a prefetch of verify (`Sec-Purpose: prefetch`) leaves a good token unused; daily cap 0 → login still `{ ok: true }` but no mail queued; outside dev, an `@example.test` address gets `{ ok: true }`, a token row, and no mail and no `mail_quota` count.

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
      case "GET /verify": return await verify(request, url, deps);
      case "POST /logout": return await logout(request, deps);
      case "GET /me": return await me(request, deps);
      default: return await dataRoute(request, path, deps); // Task 3: a stub answering 404 { ok: false }; Task 4 fills it
    }
  } catch (e) {
    logFailure("[account] request failed", e);
    return accountResponse({ ok: false, error: "server" }, 500);
  }
}
```

`login`: parse JSON `{ email, locale }`; `isEmail(normalizeEmail(email))` else 400; rate limit with `rateLimit(deps.env.KV, rateKey("client-login", ip), 10, 600)` where `ip = clientIp(request.headers) ?? (deps.dev ? "local" : null)`: no address (null; never on Vercel, whose edge sets `x-forwarded-for`) is not rate limited, and a failing store lets the request through (as `withinRateLimit` in `src/server/login.ts`; the daily mail cap below never fails open); `issueClientLogin`; when a login was issued, `!deps.dev` and `!isSampleAddress(address)`: `if (await reserveLoginMail(deps.db, deps.now)) deps.later(() => sendMail(deps.env, loginMail(...)))`, else `logFailure("[account] daily login mail cap reached", null)`; answer `{ ok: true }` (+ `devCode`, `devLink` when `deps.dev`). `deps.dev` is computed by the route as `process.env.NODE_ENV !== "production" && isLocalHost(host)` — exactly the admin rule (`src/server/login.ts`). `code` rate-limits the same way with `rateKey("client-code", ip)`, 20 per 600 s.

`verify`: like `app/api/auth/verify/route.ts` — a prefetch (`Sec-Purpose` / `Purpose` naming prefetch or prerender) goes to `/konto/sisene` without touching the token (copy the check, or move `isPrefetch` from that route into a small shared server module); the 303's `Location` is absolute (`new URL(target, url.origin)`).

`me`: read the cookie from `request.headers.get("cookie")` (parse `__Host-mslab_client=`), `getClientSession`; on success load `{ email, name }` from `clients`.

- [ ] **Step 4: Mount it as a Next route and set its headers.**
  - `src/app/api/konto/[[...path]]/route.ts`:

```ts
import { after } from "next/server";
import { getDb } from "@/db/client";
import { accountResponse, handleAccountApi, type AccountDeps } from "@/server/account-api";
import { serverEnv } from "@/server/env";
import { serverKv } from "@/server/kv";
import { logFailure } from "@/server/log";
import { hostOrigin, isLocalHost, linkBase } from "@/server/site";

export const dynamic = "force-dynamic";
/** A hung database or provider call must not hold the function for the plan's default 300 s (as /media and the upload). */
export const maxDuration = 30;

/** The router's dependencies for this request: the app's one pool, the settings, the Postgres KV store, after(). */
function deps(request: Request): AccountDeps {
  const h = request.headers;
  const env = { ...serverEnv(), KV: serverKv() };
  return {
    db: getDb(),
    env,
    now: new Date(),
    // Links in e-mails come from the Host header only (Vercel routes by it); a Host outside the allow-list gives SITE_URL.
    siteUrl: linkBase(hostOrigin(h), env.SITE_URL),
    // E-mails and notifications go out after the response.
    later: (task) => after(() => task().catch((e) => logFailure("[account] background task failed", e))),
    dev: process.env.NODE_ENV !== "production" && isLocalHost(h.get("host")),
  };
}

async function answer(request: Request): Promise<Response> {
  try {
    return (await handleAccountApi(request, deps(request))) ?? accountResponse({ ok: false }, 404);
  } catch (e) {
    logFailure("[account] request failed", e); // a missing setting (serverEnv) ends up here
    return accountResponse({ ok: false, error: "server" }, 500);
  }
}

export const GET = answer;
export const POST = answer;
export const PATCH = answer;

/** Mail scanners and link previews often send HEAD first; Next would run GET for it and use up the login link. */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET", "cache-control": "private, no-store" } });
}
```

  - `next.config.ts` `headers()`: a header given there replaces the one a route sets, so add after the rule for every path (next to the `/api/auth` rules):

```ts
// the client account's API: one visitor's data, never kept by a CDN or a shared cache (server/account-api.ts)
{ source: "/api/konto/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
// the client login link: its token is in the address, so it is never sent on as a Referer
{ source: "/api/konto/verify", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
```

- [ ] **Step 5: Tests PASS** (unit, DB, full vitest, tsc, lint); `next build` passes.
- [ ] **Step 6: Commit** `feat(accounts): login API with code and link, one-device cookies`.

---

### Task 4: Account data API and the next-step model

**Files:**
- Create: `app/src/domain/account-cards.ts`, `app/src/server/client-data.ts`
- Modify: `app/src/server/account-api.ts` (`dataRoute`), `app/src/server/account-mail.ts` (+ `deletionMail(email, locale)`: "Sinu MS LAB konto on kustutatud." — registrations stay with Maria), dicts (`account.next.*`), `app/src/server/messages.ts` (+ `changeRequestSummary`)
- Test: `app/tests/unit/account-cards.test.ts`, `app/tests/db/client-data.test.ts`, extend `tests/db/account-api.test.ts`

**Interfaces:**
- Consumes: Task 2/3; `registrationPrice(course, kind)`, `prepaymentDue(cents, choice)` (src/domain/registration.ts); `formatEUR(cents, locale)` (src/domain/money.ts); `upcomingFrom(now)` (src/domain/calendar.ts); `notifyMaria(env, subject, text, { short?, replyTo?, siteUrl? })` (src/server/notify.ts); `getSettings(db)` (src/db/queries/public.ts).
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
| `contact` | confirmed, paid in full | `confirmed` "Koht on kinnitatud." (the date, time and place are on the card's own line) | changeRequest |
| `individual` (registration without session) | any | `individualPending` "Maria võtab sinuga ühendust, et aeg kokku leppida." | none |
| `request` (practice/individual request) | handled false/true | `requestNew` "Päring on saadetud. Maria vastab peagi." / `requestDone` "Maria on päringule vastanud." | none |
| `waitlist` | — | `waitlist` "Oled ootenimekirjas. Anname teada, kui koht vabaneb." | none |
| `ecourse` | access expired/revoked | `accessEnded` "Ligipääs on lõppenud." | none |
| `ecourse` | active | `openCourse` "Ligipääs kuni {date}." | openCourse |

`amount` = `prepaymentDue(registrationPrice(course, kind), paymentChoice) - paidCents` formatted with `formatEUR`; `rest` = `registrationPrice - paidCents`. Dates/times in Europe/Tallinn.

- [ ] **Step 1: Failing unit tests for `nextStep`** — one test per table row above (11 cases), plus: amount uses `half` → ceil(price/2) − paid; RU locale formatting is not the model's job (vars are raw strings formatted by the caller — pass a formatter in or format in the component; choose one and test it).
- [ ] **Step 2: Implement `account-cards.ts`** (pure; no DB, no React).
- [ ] **Step 3: Failing DB tests for `client-data.ts`**: dashboard lists the client's registrations, requests (incl. waitlist) and active e-course access, newest session first, past last; favourites by slug (unpublished courses excluded); `mergeFavourites` ignores unknown slugs and duplicates; `setNewsletter(on)` creates a **confirmed** subscriber for the account e-mail (login proved the address), `off` deletes it; `createChangeRequest` refuses another client's registration (returns false) and inserts `{ kind: "change_request", payload: { registrationId, kind, message, email }, clientId }`; `acceptTerms` stores the current terms version = settings key `"courseTermsVersion"` (an ISO string; `"1"` when unset — do not put a version field into the `pages.body` I18n JSON); `loadEcourse` reads the same key to decide whether the notice shows; `deleteClient` deletes the client (cascade) and leaves its registrations with `clientId = null` and their name/e-mail untouched, and deletes the newsletter subscriber of that e-mail.
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
| POST `/api/konto/muutmine` | `{ registrationId, kind, message }` (message ≤ 1000) | `{ ok }`; `deps.later(() => notifyMaria(deps.env, …changeRequestSummary…, { siteUrl: deps.siteUrl }))` |
| POST `/api/konto/tingimused` | `{ slug, version }` (version = `EcourseView.terms.version` as shown, ≤ 64) | `{ ok }`; 409 `{ ok: false, error: "version" }` when the terms changed since the page loaded (nothing stored) |
| POST `/api/konto/kustuta` | `{ confirm: true }` | `{ ok }` + cleared cookies; deletion e-mail queued with `deps.later` |

- [ ] **Step 6: Tests PASS; commit** `feat(accounts): dashboard data, favourites, profile, change requests, terms, deletion`.

---

### Task 5: Login page, header state and the signed-out-elsewhere flow

**Files:**
- Create: `app/src/app/[locale]/(site)/konto/sisene/page.tsx`, `app/src/components/account/LoginForm.tsx` (+ `.module.css`), `app/src/components/account/useAccount.ts`
- Modify: `app/src/lib/site-routing.ts` (`STATIC_PAGES` + `/konto/sisene`, `/konto/lemmikud`, `/konto/andmed`; `SLUG_PAGE` + `konto/kursus/<slug>`), `app/src/components/site/Header.tsx` (account link), dicts `account.login.*`, `account.signedOut.*`
- Test: `app/tests/unit/site-routing.test.ts` (new routes known), `app/tests/e2e/account-login.spec.ts`, `app/tests/e2e/account.ts` (helpers), `app/tests/e2e/cache.spec.ts` (the shells stay cached)

**Interfaces:**
- Consumes: Task 3 endpoints.
- Produces:
  - `useAccount<T>(path: string): { state: "loading" | "ready" | "signedOut" | "replaced" | "error"; data: T | null; reload(): void }` — fetches `/api/konto…` with `credentials: "same-origin"`; 401 `replaced` → `"replaced"`, other 401 → `"signedOut"` (and the hook redirects to the login page, `#valja=1`, unless the caller opts out).
  - `hasAccountHint(): boolean` — reads `document.cookie` for `mslab_in=1`.
  - e2e helpers (`tests/e2e/account.ts`): `signInAsClient(page: Page, email: string): Promise<void>` (inserts a token row with a known raw token directly into the local DB via `onLocalDb` from `tests/e2e/fixtures.ts`, then opens `/api/konto/verify?t=`; works against `next dev` and the local production build alike), `clientEmail(label: string, project: string): string` → `e2e-client-<label>-<project>@example.test`, and `knownLoginCode(email: string): Promise<string>` for the code-entry tests: against `next dev` it is the `devCode` of POST `/api/konto/login`; under `E2E_PROD_BUILD=1` (a production build never returns one) it inserts a live token row whose `code_hash` is `sha256(`${hash}:${code}`)` for a code it chose, as `signInWithLocalSession` in `tests/e2e/admin-login.ts` does for the admin; cleanup in global setup/teardown removes `e2e-client-%@example.test` clients, tokens, sessions.

Behaviour (spec 2.1 rules 1, 3, 4, 8):
1. Field "E-post" pre-filled from `localStorage["mslab-email"]` (try/catch); button "Saada kood". On submit: trim + lowercase; `typoSuggestion` → inline "Kas mõtlesid {fixed}?" with two buttons ("Jah, paranda" / "Ei, saada nii"); then POST `/api/konto/login`; store the e-mail in localStorage.
2. Step two replaces the form: "Saatsime 6-kohalise koodi aadressile {email}." + one code field (`inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength=6`, auto-submit at 6 digits, and a primary "Logi sisse") + "Saada uus kood" (after 60 s; until then the seconds left, as text) + "Muuda e-posti". After "Saada uus kood": "Saatsime uue koodi." and one neutral line "Kui kirja ei tule, proovi poole tunni pärast uuesti." (the same for every address).
3. Wrong code → "Kood ei sobi. Proovi uuesti." (field cleared, focus kept). Expired → "Kood on aegunud. Saada uus kood." with the resend button focused.
4. Success → `location.replace(locale === "ru" ? "/ru/konto" : "/konto")` (Back never returns to a used code).
5. `#viga=link` → banner "Link on aegunud või juba kasutatud. Saada uus kood." with the form pre-filled (`#viga=server`: "Midagi läks valesti. Proovi uuesti.").
6. `#korda=1` (from the replaced message) → the code is sent immediately for the remembered e-mail and step two is shown. `#email=…` fills the field once; `#email=…&kood=1` (Task 10) opens step two for that address without sending.
7. Header: when `hasAccountHint()` the "Logi sisse" link becomes "Minu konto" → `/konto` (client-side, after hydration; no request).

8. Signed in already (`hasAccountHint()`): `location.replace` to `/konto` (`/ru/konto` by the page's language) before anything else, unless the fragment has `viga`, `korda`, `kood` or `valja`, or an `email` other than the remembered one (a shared device). `#valja=1` comes from `useAccount`'s signed-out redirect, so a stale hint costs one trip and never loops.

The fragment parameters are read in the browser only and then removed (Global Constraints; `login-address.ts`); the page itself renders the same for every visitor.

- [ ] **Step 1: Unit test for routing** (`/et/konto/sisene`, `/et/konto/lemmikud`, `/et/konto/andmed`, `/et/konto/kursus/kulmude-lami` are known pages; `/et/konto/x/y` is not).
- [ ] **Step 2: E2E first** (`tests/e2e/account-login.spec.ts`, desktop + mobile): request code (`knownLoginCode`) → type it → lands on `/konto`; wrong code message; typo suggestion for `@gmial.com` corrects the field; pre-fill on second visit; `#viga=link` banner (and `?viga=link` → 303 into the fragment); header shows "Minu konto" after login and "Logi sisse" after logout; two browser contexts: login in B → A's next `/konto` load shows "Sinu konto avati teises seadmes" with "Saada uus kood" → login page in code step. In `tests/e2e/cache.spec.ts` (runs under `E2E_PROD_BUILD=1` only): `/konto`, `/ru/konto`, `/konto/sisene`, `/ru/konto/sisene` come from the cache (`x-nextjs-cache` HIT, the CDN-only `Cache-Control`) with no `Set-Cookie`, also when the request carries a `__Host-mslab_client` / `mslab_in` cookie; `/api/konto/me` without a cookie answers 401 with `cache-control: private, no-store` and no `x-nextjs-cache`. Tasks 7 and 8 add their shells to this list.
- [ ] **Step 3: Implement**, run unit + the new e2e (both projects, against `next dev` and with `E2E_PROD_BUILD=1`) + full e2e; `next build` lists `/[locale]/konto` and `/[locale]/konto/sisene` as prerendered.
- [ ] **Step 4: Commit** `feat(accounts): login page with code, header account link`.

---

### Task 6: "Minu koolitused" dashboard and the tab bar

**Files:**
- Create: `app/src/components/account/AccountShell.tsx` (+ css; tabs Minu koolitused · Lemmikud · Minu andmed; avatar menu with "Logi välja"; phone: sticky bottom bar with icon + label, ≥ 44 px targets; look taken from prototype B's dashboard and the site's tokens), `AccountCourseCard.tsx`, `NextStepLine.tsx`, `PrepaymentInfo.tsx`, `ChangeRequestDialog.tsx`, `CardSkeleton.tsx`
- Modify: `app/src/app/[locale]/(site)/konto/page.tsx` (replace the placeholder with `<AccountShell tab="courses"><CoursesTab/></AccountShell>`; it stays a static shell), dicts `account.dashboard.*`
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

- [ ] **Step 1: E2E first** — sign in as a client that has: one awaiting (half) registration, one confirmed paid-in-full registration (future), one cancelled, one practice request, one waitlist entry, one active e-course access (insert fixtures directly). Assert each card's sentence and single button; the pay panel shows the IBAN and reference from a seeded `prepayment` setting; without the setting the card says "Maria saadab sulle arve…"; change request reaches the admin inbox (`/admin/paringud` shows it — sign in as admin with `signInAsAdmin(page, context, ip, created)` from `tests/e2e/admin-login.ts`); swipe on mobile moves to the next card (CDP touch, like `tests/e2e/swipe.spec.ts`); bottom tab bar visible at 390 px, top tabs at 1440 px; no horizontal overflow at 390/834/1440/2560.
- [ ] **Step 2: Implement; run (the cache spec still answers `/konto` from the cache); commit** `feat(accounts): Minu koolitused dashboard`.

---

### Task 7: E-course page with the terms notice

**Files:**
- Create: `app/src/app/[locale]/(site)/konto/kursus/[slug]/page.tsx`, `app/src/components/account/TermsGate.tsx`, `EcourseView.tsx`
- Modify: `app/src/db/seed-data.ts` (+ `pages.course_terms` ET/RU default text; no version in the body JSON), `app/src/server/admin-site.ts` + `app/src/components/admin/*` Seaded legal-pages editor (add "E-koolituse tingimused" next to privacy/terms; saving it also writes settings key `"courseTermsVersion"` = the save time ISO string, in the same transaction), dicts `account.ecourse.*`
- Test: `app/tests/e2e/account-ecourse.spec.ts`, extend `tests/db/client-data.test.ts`, `tests/unit/cache-targets.test.ts`, `tests/e2e/cache.spec.ts` (+ `/konto/kursus/<an e-course slug>`)

The shell page: `generateStaticParams()` returns `[]` (rendered on the first visit and then cached per slug, like `koolitused/[slug]`); it reads nothing but `params` and loads nothing personal — the course view comes from GET `/api/konto/kursus/:slug`. The terms text is account-only: saving the new Seaded part revalidates no public page (`revalidationTargets({ kind: "settings", parts: ["course_terms"] })` in `src/server/cache-targets.ts` returns no target; add that case to its test).

**Behaviour (spec S5/C54):**
- Without access → "Sul ei ole sellele koolitusele ligipääsu." + "Vaata koolitust" → public course page.
- With access, terms for the current version not accepted → a full-width notice (not a dismissable modal): title "Enne alustamist", the `course_terms` text, one checkbox "Olen tutvunud ja nõustun tingimustega" and one button "Alusta koolitust" (disabled until checked) → POST `/api/konto/tingimused` → the course view.
- The acceptance sends `{ slug, version }` with the version the notice showed; a 409 `version` answer means the admin saved new terms meanwhile: reload the course view (the notice shows the new text, checkbox cleared) — no error message beyond the fresh notice.
- Course view: title, "Ligipääs kuni {date}", the module list (locked icons as on the public page), and "Sisu lisandub peagi." — nothing else.
- Admin changes the terms text → version changes → the notice shows again on next open.

- [ ] Steps: e2e first (no access / gate / accept / re-gate after admin edit), implement, run, commit `feat(accounts): e-course page with terms notice`.

---

### Task 8: Lemmikud, favourites merge, Minu andmed

**Files:**
- Create: `app/src/app/[locale]/(site)/konto/lemmikud/page.tsx`, `konto/andmed/page.tsx`, `app/src/components/account/FavouritesTab.tsx`, `DetailsTab.tsx`
- Modify: `app/src/components/site/FavouriteButton.tsx` (account mode), `app/src/lib/favourites.ts` (merge helpers), dicts `account.favourites.*`, `account.details.*`
- Test: `app/tests/unit/favourites.test.ts`, `app/tests/e2e/account-favourites.spec.ts`, `app/tests/e2e/account-details.spec.ts`, `tests/e2e/cache.spec.ts` (+ `/konto/lemmikud`, `/konto/andmed`, RU too)

**Behaviour:**
- After the first successful dashboard load in a browser that has `localStorage["mslab-fav"]`, POST `/api/konto/lemmikud/merge` once, then clear the local list (only after a 200).
- `FavouriteButton`: when `hasAccountHint()` → reads the state from the account copy in `localStorage` (`mslab-account-fav`, refreshed on every account load; cleared on logout, a 401, deletion and every login, so a shared device never shows the previous person's hearts; other tabs follow through the `storage` event) and toggles via POST `/api/konto/lemmikud`; on 401 falls back to the browser list. Label/`aria-pressed` behaviour unchanged.
- Lemmikud: course cards (public `CourseCard`) with ♡ to remove; empty state "Lisa koolitus lemmikuks ♡ koolituse lehel." + "Vaata koolitusi".
- Minu andmed: name, phone (both optional), language (ET/RU radio; switching also navigates to the same tab in that language), "Saada mulle uudiskirja" switch, "Salvesta"; at the very bottom "Kustuta konto" → confirmation step "Kas kustutame su konto? Sinu registreeringud jäävad Mariale alles." with "Jah, kustuta" / "Tühista" → POST `/api/konto/kustuta` → home page (`#konto-kustutatud`) with notice "Konto on kustutatud." A language switch opens the same tab in the other language with `#salvestatud`.

- [ ] Steps: unit tests for merge helpers; e2e first (anonymous favourite → login → it is in Lemmikud and gone from localStorage; toggle in account mode; profile save; newsletter on creates a confirmed subscriber; delete account keeps the registration (admin sees it) and logs out); implement; run (the cache spec answers both new shells from the cache); commit `feat(accounts): favourites in the account, my details, account deletion`.

---

### Task 9: Admin — Õpilased, access, view as client, prepayment setting, change requests

**Files:**
- Create: `app/src/server/admin-clients.ts`, `app/src/server/actions/admin-clients.ts`, `app/src/app/admin/(panel)/opilased/page.tsx`, `app/src/app/admin/(panel)/opilased/[id]/vaade/page.tsx`, `app/src/components/admin/ClientDrawer.tsx`
- Modify: `app/src/components/admin/sections.ts` (+ `"clients"` in the `Section` union and `{ key: "clients", href: "/admin/opilased", icon: "user" }` after registrations), `app/src/i18n/dict/admin.ts`, Seaded (`admin-site.ts` part "prepayment" + editor fields receiver/IBAN/bank/reference prefix), requests inbox (`/admin/paringud` shows `change_request` with a link to the registration), `tests/unit/admin-guards.test.ts` (new action file covered)
- Test: `app/tests/db/admin-clients.test.ts`, `app/tests/e2e/admin-clients.spec.ts`, `tests/unit/cache-targets.test.ts` (the `prepayment` part revalidates nothing)

**Interfaces:**
- Consumes: `loadDashboard` (Task 4), `AccountShell`/`CoursesTab` with `readOnly` (Task 6), guards.
- Produces: `listClients(db, { filter: "all" | "e" | "k"; q: string; page: number })`, `clientDetail(db, id)`, actions `grantCourseAccess` / `revokeCourseAccess` (any admin; `grantedBy` = the admin's e-mail; expiry default now + `accessMonths`, editable date).

**Behaviour:**
- List: name, e-mail, created, number of courses; filter chips Kõik / E-õpe / Kontaktõpe (A4); search; 50 per page (`?leht=`), like the inboxes.
- "Lisa õpilane" (ruling): a client by e-mail without a session or mail (`addClient`, under the address lock), with the language, name and phone of the address's newest registration or request; her records are linked, and her first login finds her (not new).
- Drawer: registrations, requests, e-course access (with expiry and who granted it), terms acceptances; buttons "Ava ligipääs" (pick an e-course, date pre-filled) and "Lõpeta ligipääs"; link "Vaata tema vaadet".
- View as: `/admin/opilased/[id]/vaade` — `requireAdmin()`, loads `loadDashboard(getDb(), id, new Date())` on the server and renders `<AccountShell readOnly banner="Vaatad kliendi {nimi} vaadet — muuta ei saa"><CoursesTab data readOnly/></AccountShell>`; every button is `aria-disabled` and does nothing; no client session is created or touched.
- Prepayment setting saved through the existing site-parts engine (stale guard as in 13B); saving revalidates nothing public (data is account-only): `revalidationTargets({ kind: "settings", parts: ["prepayment"] })` returns no target.

- [ ] Steps: DB tests (filter by course type, search, paging, grant/revoke/expiry, grantedBy recorded), e2e first (admin grants access → client sees the e-course card; view-as shows the same cards with disabled buttons and the client's session still works afterwards; change request appears in Päringud), implement, run guard tests, commit `feat(admin): clients, e-course access and read-only client view`.

---

### Task 10: Registration confirmation e-mails to visitors

**Files:**
- Modify: `app/src/server/submit.ts` (after a stored registration/waitlist/individual/practice request: queue a visitor confirmation with `deps.later` — next/server `after()` — the path Maria's notification already takes), `app/src/server/account-mail.ts` (`registrationConfirmationMail`, `requestConfirmationMail`), dicts `account.mail.*`
- Test: `app/tests/db/actions.test.ts` (extend), `app/tests/unit/account-mail.test.ts`

**Behaviour (spec section 8):**
- Group registration: subject "Registreering on vastu võetud — {course}"; body: course, date/time/city, the next step (prepayment amount + instructions from the `prepayment` setting, or "Maria saadab sulle arve"), "Koht kinnitatakse pärast vähemalt 50% ettemaksu laekumist.", button "Ava minu konto" → `${siteUrl}/konto/sisene#email=<urlencoded>` (pre-fills the field; `siteUrl` = `deps.siteUrl`).
- When `wantsAccount` was ticked: the same e-mail also contains a live login code + button (issue via `issueClientLogin`; counts against `reserveLoginMail`; if the cap is reached, the e-mail goes out without the code).
- Individual, practice, waitlist: short confirmation with the dashboard card's sentence ("Päring on saadetud. Maria vastab peagi." / "Oled ootenimekirjas. Anname teada, kui koht vabaneb.") and the same "Ava minu konto" button.
- Caps (ruling): at most 3 confirmations per address and day; a mail with a code counts against the login cap (60), one without against `CONFIRMATION_MAIL_DAILY_CAP` (30: each comes with Maria's uncounted notification). Nothing is spent before the mail is sure to go: sample skip → Resend configured → per address → content → login → quota → send.
- Language = the registration's locale. Sample/test addresses are never mailed: skip when `isSampleAddress(to)` (Task 2), before reserving any quota.
- A registration, request, waitlist entry or newsletter row for an address that has an account is linked in its INSERT (`client-auth.ts accountOf`, `FOR KEY SHARE`), and fills the account's empty name and phone (`fillClientContact`), so a signed-in student sees the new card at once (final review C1, I1).
- The login page reads `#email=` once in the browser to pre-fill (then removes it from the address bar). A fragment, not a query: it never reaches the server, so no cached shell can ever carry an address (a regeneration bakes the request's query into the page).

- [ ] Steps: unit tests for the mail texts (ET/RU, with and without prepayment info, with and without code); DB tests: registration with `wantsAccount` creates a login token, without it creates none, `@example.test` is never sent; implement; full suites; commit `feat(accounts): confirmation e-mails with the account button`.

---

### Task 11: Deploy and Hobby-plan acceptance (controller)

**Files:**
- Modify: `tools/cache-smoke.mjs` (repo root): a third part "C. account": each `/konto…` shell (`/konto`, `/ru/konto`, `/konto/sisene`, `/ru/konto/sisene`, `/konto/lemmikud`, `/konto/andmed`, `/konto/kursus/<a published e-course slug>`) asked twice with GET — 200, no `set-cookie`, and the second answer's `x-vercel-cache` HIT, PRERENDER or STALE; GET `/api/konto/me` twice without a cookie — 401, `cache-control` `private, no-store`, `x-vercel-cache` never HIT or STALE; GET `/konto/sisene?viga=link` — 303 to `/konto/sisene#viga=link`, `no-store`. Still GET/HEAD only; any miss is an error (exit 1); `--only=C` runs this part alone. Committed on the branch before the merge.
- `pages.course_terms` on Railway: `npm run db:ensure-terms -- --target railway` (inserts only that row, `on conflict (key) do nothing`), never `db:seed --target railway` (it would bring back renamed sample courses, deleted posts, emptied slides), before the first "Ava ligipääs".

- [ ] **Step 1 (read-only):** verify that `0001_client_accounts.sql` is on Railway — do **not** re-apply it. With the public TCP proxy URL in the shell only (`docs/deploy.md` section 6), read: `select count(*) from drizzle.__drizzle_migrations` (3: 0000–0002), `select to_regclass('public.<table>')` for `clients`, `client_login_tokens`, `client_sessions`, `course_access`, `terms_acceptances`, `client_favourites`, `mail_quota` (all non-null), `select enum_range(null::request_kind)` (contains `change_request`), and the `client_id` column on `registrations`, `requests`, `subscribers` (`information_schema.columns`). Print names and counts only. (If a task did add a migration after all, apply it now with `npm run db:migrate`: migrate first, then deploy.)
- [ ] **Step 2:** on the branch: full `npx vitest run`, `tsc`, lint, `next build` (every `/[locale]/konto…` route prerendered), e2e against `next dev` and with `E2E_PROD_BUILD=1`, visual; the `tools/cache-smoke.mjs` change committed.
- [ ] **Step 3:** merge `feat/phase2a-client-accounts` into `main` and push `main` — that push is the production deployment (Vercel Git integration). Do not push the feature branch itself.
- [ ] **Step 4:** confirm the deployment is **READY** and holds the production alias (`vercel ls mslab` / `vercel inspect <deployment-url>`, or the dashboard's Deployments).
- [ ] **Step 5:** acceptance on https://mslab.diipsolutions.eu:
  - the `/konto…` shells come from the CDN: `x-vercel-cache` HIT, PRERENDER or STALE, and no `set-cookie` (also with the client's own cookies sent);
  - `/api/konto/me` without a cookie answers 401 `{ reason: "none" }` with `Cache-Control: private, no-store`, and is never answered from the cache;
  - `node tools/cache-smoke.mjs` PASS (parts A, B and C);
  - remote read-only e2e + visual green (`E2E_BASE_URL=https://mslab.diipsolutions.eu E2E_ALLOW_REMOTE=1`, 1–2 workers; the browser blocks every POST there).
- [ ] **Step 6:** function durations: while the sample client of Step 7 opens every tab about 10 times, read the `/api/konto*` invocations from the runtime logs (`vercel logs <deployment-url>`, or the dashboard's Logs filtered to `/api/konto`) and note max/median duration per endpoint in the ledger (`.superpowers/sdd/2026-10-02-phase2a-client-accounts/progress.md`). No separate measurement doc.
- [ ] **Step 7:** live check with a sample client: take the address of a sample registration (`*.naidis@example.test`, a confirmed contact registration with a future date). Do not request a code for it through the form (that would e-mail a non-existent domain): insert one `client_login_tokens` row for it in Railway as `signInWithLocalSession` in `tests/e2e/admin-login.ts` does locally (`hash` = SHA-256 hex of a random 32-byte base64url token, `code_hash` = SHA-256 hex of `${hash}:<six digits>`, `expires_at` = now + 30 min) and open `/api/konto/verify?t=<token>` in a browser — the app creates the client and links the sample registration. Then: admin "Ava ligipääs" (a published e-course) → the client sees the e-course card; "Vaata tema vaadet" shows the same cards with disabled buttons and the client's session still works; "Soovin muuta aega" on the registration → the change request lands in Päringud. Afterwards delete the test client and what it made, by SQL in Railway: its `change_request` row (`payload->>'email'` = the address), its `client_login_tokens` rows, and the `clients` row (cascades sessions, access, terms, favourites; the sample registration keeps its data with `client_id` null). Not "Kustuta konto": that queues a deletion e-mail to the fake address.
- [ ] **Step 8:** record the outcome (Steps 1–7) in the ledger; nothing else to commit.

---

## Changes from the Worker plan

- The "Cloudflare Workers … retired" banner is gone; Goal, Architecture, Tech Stack and File Structure describe Vercel Hobby (`@opennextjs/cloudflare`, Hyperdrive and KV namespaces dropped).
- Global Constraints: Hobby limits (1M invocations, 4.5 MB body, daily cron, 100 GB) replace the 10 ms / 8 ms CPU budgets; the static-shell rule now gives the CDN / no-personal-data reason and a build-output and cache-spec check.
- New constraint: no Railway writes, no deploys and no push of the branch before Task 11 (merge to `main` deploys; a pushed branch makes a preview).
- Task 1 marked done (`b21f56f`); 0001 (with 0002) already on Railway; text kept as executed.
- Task 2: `insertRegistration` inserts its own contact course (`makeTestDb()` migrates but does not seed); the code is otherwise unchanged (`Db`, `Q`, `token.ts`, schema names all match).
- Task 3: one mount, an ordinary Next route handler; `src/worker/account-front.ts`, every `worker.ts` change, `accountAnswer`, Hyperdrive, `getCloudflareContext` and `ctx.waitUntil(sql.end…)` dropped; the route uses `getDb()`.
- `AccountDeps.later(task)` instead of `waitUntil(p)` / `defer(p)`: the same shape as `LoginDeps` and the forms' `Deps` (work starts after the response).
- `AccountDeps` has no separate `kv`: `Env` already carries `KV: TextKv`, built as `{ ...serverEnv(), KV: serverKv() }` like `api/auth/request`.
- `siteUrl` = `linkBase(hostOrigin(headers), env.SITE_URL)` and `dev` = `NODE_ENV !== "production" && isLocalHost(host)`, as in `api/auth/request` / `server/login.ts`.
- Rate-limit address: `clientIp(headers) ?? (deps.dev ? "local" : null)`; null is not limited and a failing store lets the request through (as `server/login.ts`); the mail cap still never fails open.
- `accountResponse` sends `Cache-Control: private, no-store` (was `no-store`).
- `next.config.ts` gets `/api/konto/:path*` → `private, no-store` and `/api/konto/verify` → `Referrer-Policy: no-referrer`, because a config header replaces the route's own; `tests/unit/next-config.test.ts` extended.
- The route exports `HEAD` → 405 (Next would run GET for a HEAD and a scanner would burn the link); `verify` skips prefetches like `api/auth/verify` (spec 5 "same handling as the admin link").
- `maxDuration = 30` on the account route, as `/media` and the upload route.
- `return await dataRoute(...)` in the router, so its errors reach the `catch`.
- Task 3 DB tests name `fakeKv()` from `tests/fakes.ts` for the in-memory KV.
- Task 4 / Task 10: `deps.waitUntil(...)` → `deps.later(() => ...)`; `notifyMaria` gets `{ siteUrl: deps.siteUrl }`.
- Task 5: `E2E_PROD_BUILD=1` has no `devCode`, so `knownLoginCode` inserts a known token + code there; `tests/e2e/cache.spec.ts` checks the shells (HIT, CDN-only Cache-Control, no Set-Cookie, also with cookies sent) and `/api/konto/me`; Tasks 7–8 extend its list.
- The shells' parameters are fragments read in the browser (Task 7 ruling: a regenerated shell keeps the request's query); the middleware answers a query on a shell with a 303 into the fragment.
- Task 6: `signInAsAdmin(page, context, ip, created)` from `tests/e2e/admin-login.ts` named.
- Task 7: the e-course shell uses `generateStaticParams() → []` (cached per slug on first visit); `course_terms` and (Task 9) `prepayment` revalidate no public page, with a `cache-targets` test case each.
- Task 9: the `Section` union in `sections.ts` gains `"clients"` (not only the list entry).
- Design base path: `site/p/b/…` → `app/public/p/b/…` (the old hub copy was removed).
- Task 11 rewritten: read-only Railway check instead of the migration, merge + push = deploy, READY check, CDN acceptance, `tools/cache-smoke.mjs` at the repo root (not `app/tools`) with a part C, durations from the runtime logs into the ledger (no `account-cpu.md`, no `wrangler tail`), commit step dropped.
- Task 11 sample client: a sample-registration address (`*.naidis@example.test`) signs in through a token row inserted in Railway (no e-mail to a fake domain); clean-up by SQL instead of "Kustuta konto".
