# MS LAB main site — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the real MS LAB website (all public pages, ET + RU, content from Postgres) and a content admin at `mslab.diipsolutions.eu`, with the review hub still reachable at `/guide`.

**Architecture:** One Next.js App Router project in `app/`, deployed to Cloudflare Workers with `@opennextjs/cloudflare` as Worker `mslab-web`. Postgres on Railway reached through Cloudflare Hyperdrive; Drizzle ORM. Images in R2 served by a `/media/[...key]` route. Public forms and admin edits are Server Actions validated by Zod; notifications via Resend e-mail + the existing @MS_Lab_bot Telegram bot. The old `mslab-guide` Worker's static files and comment API move into this app.

**Tech Stack:** Next.js 16.3, React 19.3, TypeScript, @opennextjs/cloudflare 1.20, wrangler 4.145, drizzle-orm 0.45 + drizzle-kit 0.31 + postgres 3.4, zod 4, resend 6, Vitest 5 + @electric-sql/pglite (DB tests), Playwright 1.63, plain CSS (tokens + CSS Modules), next/font (Jost, Manrope, JetBrains Mono).

**Sources every UI task must read first:**
- Spec: `docs/superpowers/specs/2026-10-01-main-site-phase1-design.md`
- Checklist (IDs referenced below): `docs/feedback/2026-10-01-checklist.md`
- Maria's comments verbatim: `docs/feedback/2026-10-01-maria-comments-raw.md`
- Prototype B source (base): `site/p/b/app.js` (functions `header`, `hero`, `courseCard`, `practicePanel`, `newsletter`, `footer`, `catalogue`, `detail`, `calendar`, `practice`, `about`, `news`, `article`, `adminShell`, `adminHome`, `editor`), `site/p/b/styles.css`, `site/p/b/journey.css`. B already contains RU strings in `tr(et, ru)` calls — reuse them for `ru.ts`.
- Prototype A (fonts, slide control, calendar row, gallery): `site/p/a/index.html` (search `01 / 05`, `LINN`, `Koolituskalender`, `stock/scis.jpg`).
- Prototype D (formats block, statement, trainer, blog, FAQ, contact, campaign, badge editor, campaign editor): `site/p/d/app.js` (functions `pHome`, `fmtPanel`, `steps`, `pCatalog`, `pTrainer`, `pNewsList`, `pArticle`, `campHtml`, `adminBadges`, `adminCamp`), `site/p/d/styles.css`.

## Global Constraints

- Estonian is the default locale at `/`; Russian at `/ru` + the same path segments. Every UI string comes from `src/i18n/dict/{et,ru}.ts`; every content field is `{ et: string; ru?: string }` and falls back to `et` on the public site.
- A course is either `e_learning` or `contact`. No hybrid purchase/registration option anywhere (K1, K2).
- A registration is created with status `awaiting_prepayment`; phase 1 code never sets `confirmed` automatically (P15).
- Fonts: Jost (headings, numbers, prices), Manrope (UI/body/menu/buttons/language switch), JetBrains Mono only for slide counter and small numerals (G2, G4).
- Colours: ink `#222222`, rose `#9E8993`, iced `#AD9FA6`, fog `#C0B7BB`, heather `#D5D0D3`, first-light `#EBE8E9`, orchid `#DDD4DC`, paper `#FFFFFF`, canvas `#F6F4F5`, line `#E6E1E3`, ok `#2F5D46`, warn `#6B4F5C`, bad `#8A3B3B`, lilac newsletter surface = B's newsletter background (copy exact value from `site/p/b/styles.css` `.newsletter`).
- Admin allow-list exactly: `dim@example.test`, `maria@example.test`.
- No AI tool names (Claude, GPT, Lovable, …) in any client-facing text, URL, file name or image metadata.
- Whole host stays `noindex` (header `X-Robots-Tag: noindex, nofollow`, robots.txt disallow except link-preview bots).
- Responsive check widths: 390, 834, 1440, 2560. No horizontal overflow; touch targets ≥44 px; `prefers-reduced-motion` respected.
- Do not commit secrets. `.dev.vars` and `.env*` are git-ignored.
- Commit after every task with a Conventional Commit message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
app/
  package.json, tsconfig.json, next.config.ts, open-next.config.ts, wrangler.jsonc,
  drizzle.config.ts, vitest.config.ts, playwright.config.ts, middleware.ts (src/)
  public/
    guide/ p/ feedback.js robots.txt          ← moved from site/ (Task 15)
    seed/                                     ← prototype images used by seed data
  src/
    styles/tokens.css, globals.css
    i18n/locales.ts, field.ts, dict/et.ts, dict/ru.ts, href.ts
    domain/course.ts, sessions.ts, registration.ts, recommend.ts      (pure, unit-tested)
    db/schema.ts, client.ts, seed.ts, queries/*.ts
    server/env.ts, ratelimit.ts, notify.ts, auth.ts, media.ts, forms.ts, actions/*.ts
    components/site/*  (Header, Hero, SlideControl, Footer, Newsletter, FormatsBlock, Steps,
                        CourseCard, Statement, TrainerTeaser, PracticeBlock, BlogCarousel, Faq,
                        ContactBlock, CampaignPopup, Gallery, Lightbox, ShareButton,
                        FavouriteButton, Recommendations, CalendarRow, forms/*)
    components/admin/* (Shell, Sidebar, BadgeEditor, ImageUpload, I18nInput, ListEditor, …)
    app/[locale]/(site)/layout.tsx, page.tsx, koolitused/…, koolituskalender/…, praktika/…,
        koolitaja/…, uudised/…, kontakt/…, privaatsus/…, tingimused/…
    app/admin/login/page.tsx, app/admin/(panel)/layout.tsx + section pages
    app/api/auth/…, app/api/feedback/…, app/media/[...key]/route.ts
  tests/unit/*.test.ts, tests/db/*.test.ts, tests/e2e/*.spec.ts, tests/visual/shots.spec.ts
```

---

### Task 0: Accounts and resources (Dim + agent)

**Files:** none (infrastructure). Record IDs in `app/wrangler.jsonc` in Task 1.

- [ ] **Step 1: Railway Postgres** (agent): `railway init --name mslab` then `railway add --database postgres`. Read the public URL without printing it: `railway variables --service Postgres --json > $SCRATCH/railway.json`.
- [ ] **Step 2: Hyperdrive** (agent): `npx wrangler hyperdrive create mslab-db --connection-string="$(node -e "console.log(require(process.argv[1]).DATABASE_PUBLIC_URL)" $SCRATCH/railway.json)"`. Note the returned id. Delete `$SCRATCH/railway.json` afterwards.
- [ ] **Step 3: R2** (agent): `npx wrangler r2 bucket create mslab-media`.
- [ ] **Step 4: KV** (agent): reuse namespace `325a989613294fa19c86451afd8f6fa3` (already holds comments and the Telegram chat id).
- [ ] **Step 5: Resend** (Dim): create/choose a Resend account, add and verify a sending domain he controls (proposal: `send.diipsolutions.eu`, DNS records go into the Cloudflare zone `diipsolutions.eu`), create an API key. Until done, login links are delivered only in dev (Task 10) and admin e-mail notifications are skipped (Telegram still works).
- [ ] **Step 6: Secrets** (Dim runs, after Task 1 created the Worker): `npx wrangler secret put RESEND_API_KEY --name mslab-web`, `npx wrangler secret put TELEGRAM_BOT_TOKEN --name mslab-web`. Agent sets `SESSION_SECRET` (random 32 bytes) and copies `ADMIN_KEY` value from the old Worker's known value.

---

### Task 1: Scaffold Next.js on Cloudflare, tokens, fonts, tooling

**Files:**
- Create: `app/` via `npm create cloudflare@latest app -- --framework=next --platform=workers --no-deploy --no-git --typescript`
- Modify: `app/wrangler.jsonc`, `app/next.config.ts`, `app/package.json`
- Create: `app/src/styles/tokens.css`, `app/src/styles/globals.css`, `app/vitest.config.ts`, `app/playwright.config.ts`, `app/tests/unit/smoke.test.ts`
- Modify: root `.gitignore`

**Interfaces:** Produces CSS custom properties (`--ink`, `--rose`, `--iced`, `--fog`, `--heather`, `--first`, `--orchid`, `--paper`, `--canvas`, `--line`, `--lilac`, `--ok`, `--warn`, `--bad`, `--font-display`, `--font-body`, `--font-mono`, `--gutter`, `--max`, `--r-card`, `--r-tile`, `--ease`) used by every component.

- [ ] **Step 1: Scaffold** — run the create command above from repo root; accept defaults. Then `cd app && npm i drizzle-orm postgres zod resend && npm i -D drizzle-kit vitest @electric-sql/pglite @playwright/test`.
- [ ] **Step 2: wrangler.jsonc**

```jsonc
{
  "name": "mslab-web",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<from Task 0 step 2>", "localConnectionString": "postgres://postgres:postgres@localhost:5432/mslab" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "mslab-media" }],
  "kv_namespaces": [{ "binding": "KV", "id": "325a989613294fa19c86451afd8f6fa3" }],
  "vars": { "SITE_URL": "https://mslab.diipsolutions.eu", "ADMIN_EMAILS": "dim@example.test,maria@example.test", "MAIL_FROM": "MS LAB <info@send.diipsolutions.eu>", "MARIA_EMAIL": "maria@example.test" }
}
```
(No `routes` yet — deploy goes to `mslab-web.<account>.workers.dev` until Task 16.)

- [ ] **Step 3: tokens.css** — define all colours from Global Constraints plus:

```css
:root{
  --font-display: var(--font-jost), "Jost", system-ui, sans-serif;
  --font-body: var(--font-manrope), "Manrope", system-ui, sans-serif;
  --font-mono: var(--font-jbmono), ui-monospace, monospace;
  --gutter: clamp(16px, 4vw, 56px); --max: 1280px;
  --r-card: 20px; --r-tile: 28px; --ease: cubic-bezier(.2,.7,.2,1);
}
```
`globals.css`: box-sizing reset, `body{font-family:var(--font-body);color:var(--ink);background:var(--paper)}`, `h1,h2,h3{font-family:var(--font-display);font-weight:400}`, focus-visible ring `2px solid var(--rose)`, `@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`.
- [ ] **Step 4: Fonts** in `src/app/layout.tsx` with `next/font/google`: `Jost({subsets:['latin','latin-ext','cyrillic'],weight:['300','400','500'],variable:'--font-jost'})`, `Manrope({subsets:['latin','latin-ext','cyrillic'],weight:['400','500','600','700'],variable:'--font-manrope'})`, `JetBrains_Mono({subsets:['latin'],weight:['400'],variable:'--font-jbmono'})`.
- [ ] **Step 4b: Dev bindings** — `next.config.ts` must call `initOpenNextCloudflareForDev()` (from `@opennextjs/cloudflare`) so `getCloudflareContext()` works under `next dev`; local Hyperdrive uses `localConnectionString` → set it to a local Docker Postgres (`docker run -d --name mslab-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mslab -p 5432:5432 postgres:17`) so dev never touches the Railway data.
- [ ] **Step 5: Test tooling** — `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ resolve: { alias: { "@": path.resolve(__dirname, "src") } }, test: { include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"] } });
```
`tests/unit/smoke.test.ts`: `import { expect, test } from "vitest"; test("vitest runs", () => expect(1 + 1).toBe(2));`
Scripts in package.json: `"test": "vitest run"`, `"e2e": "playwright test"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"db:seed": "tsx src/db/seed.ts"` (add `tsx` dev dep).
- [ ] **Step 6: Run** `npm test` → PASS; `npm run build` (OpenNext build: `npx opennextjs-cloudflare build`) → succeeds.
- [ ] **Step 7: Deploy skeleton** `npx opennextjs-cloudflare deploy` → note the workers.dev URL; `curl -I` it → 200.
- [ ] **Step 8: Commit** `git add app .gitignore && git commit -m "feat(app): scaffold Next.js on Cloudflare with tokens and fonts"`.

---

### Task 2: i18n foundation

**Files:**
- Create: `src/i18n/locales.ts`, `src/i18n/field.ts`, `src/i18n/href.ts`, `src/i18n/dict/et.ts`, `src/i18n/dict/ru.ts`, `src/middleware.ts`
- Test: `tests/unit/i18n.test.ts`

**Interfaces (produces):**
```ts
export type Locale = "et" | "ru";                          // locales.ts
export const LOCALES: Locale[] = ["et", "ru"];
export type I18n = { et: string; ru?: string };             // field.ts
export function pick(f: I18n | null | undefined, l: Locale): string;
export function pickList(f: I18n[] | null | undefined, l: Locale): string[];
export function href(l: Locale, path: string): string;     // href.ts: "/x" → "/x" (et) | "/ru/x" (ru)
export function switchLocaleHref(pathname: string, to: Locale): string;
export type Dict = typeof et;                               // dict/et.ts exports `et`, dict/ru.ts exports `ru: Dict`
export function getDict(l: Locale): Dict;                   // locales.ts
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, test } from "vitest";
import { pick, pickList } from "@/i18n/field";
import { href, switchLocaleHref } from "@/i18n/href";
import { et } from "@/i18n/dict/et";
import { ru } from "@/i18n/dict/ru";

describe("i18n", () => {
  test("pick falls back to et", () => {
    expect(pick({ et: "Tere", ru: "Привет" }, "ru")).toBe("Привет");
    expect(pick({ et: "Tere" }, "ru")).toBe("Tere");
    expect(pick({ et: "Tere", ru: "  " }, "ru")).toBe("Tere");
    expect(pick(null, "et")).toBe("");
  });
  test("pickList", () => expect(pickList([{ et: "a", ru: "б" }, { et: "c" }], "ru")).toEqual(["б", "c"]));
  test("href", () => {
    expect(href("et", "/koolitused")).toBe("/koolitused");
    expect(href("ru", "/koolitused")).toBe("/ru/koolitused");
    expect(href("ru", "/")).toBe("/ru");
  });
  test("switchLocaleHref", () => {
    expect(switchLocaleHref("/ru/praktika", "et")).toBe("/praktika");
    expect(switchLocaleHref("/praktika", "ru")).toBe("/ru/praktika");
    expect(switchLocaleHref("/", "ru")).toBe("/ru");
  });
  test("ru dictionary has every et key", () => {
    const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => typeof v === "object" ? keys(v, p + k + ".") : [p + k]);
    expect(keys(ru).sort()).toEqual(keys(et).sort());
  });
});
```
- [ ] **Step 2:** `npm test` → FAIL (modules missing).
- [ ] **Step 3: Implement**

```ts
// field.ts
import type { Locale } from "./locales";
export type I18n = { et: string; ru?: string };
export function pick(f: I18n | null | undefined, l: Locale): string {
  if (!f) return "";
  const v = l === "ru" ? f.ru : f.et;
  return v && v.trim() ? v : f.et ?? "";
}
export function pickList(f: I18n[] | null | undefined, l: Locale): string[] { return (f ?? []).map((x) => pick(x, l)); }

// href.ts
import type { Locale } from "./locales";
export function href(l: Locale, path: string): string {
  const p = path.startsWith("/") ? path : "/" + path;
  if (l === "et") return p;
  return p === "/" ? "/ru" : "/ru" + p;
}
export function switchLocaleHref(pathname: string, to: Locale): string {
  const bare = pathname === "/ru" ? "/" : pathname.startsWith("/ru/") ? pathname.slice(3) : pathname;
  return href(to, bare);
}

// locales.ts
import { et } from "./dict/et"; import { ru } from "./dict/ru";
export type Locale = "et" | "ru"; export const LOCALES: Locale[] = ["et", "ru"];
export function getDict(l: Locale) { return l === "ru" ? ru : et; }
```
`dict/et.ts` exports `export const et = { nav: { courses: "Koolitused", calendar: "Koolituskalender", practice: "Praktika", trainer: "Koolitaja", news: "Uudised", login: "Logi sisse", cart: "Ostukorv", menu: "Menüü", langSwitch: "Vaheta keelt" }, hero: {...}, formats: {...}, course: {...}, calendar: {...}, practice: {...}, trainer: {...}, news: {...}, forms: {...}, footer: {...}, newsletter: {...}, campaign: {...}, common: {...} } as const;` — fill every key the components in Tasks 6–9 use; take wording from B's `tr()` first argument (ET) and second argument (RU) and Maria's texts (checklist R2, K11, P10, P11, H13). `dict/ru.ts`: `import type { Dict } …; export const ru: Dict = {...}` with the same keys.
- [ ] **Step 4: Middleware**

```ts
// src/middleware.ts — ET lives at "/", RU at "/ru"; internally both render app/[locale]/…
import { NextResponse, type NextRequest } from "next/server";
const PASS = /^\/(ru(\/|$)|admin|api|media|guide|p\/|_next|feedback\.js|robots\.txt|favicon|seed\/|og\.)/;
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/et/") || pathname === "/et") {
    const url = req.nextUrl.clone(); url.pathname = pathname.slice(3) || "/"; return NextResponse.redirect(url, 308);
  }
  if (PASS.test(pathname)) return NextResponse.next();   // /ru/* renders app/[locale]=ru directly; admin/api/static untouched
  const url = req.nextUrl.clone(); url.pathname = "/et" + (pathname === "/" ? "" : pathname);
  return NextResponse.rewrite(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
```
Pages live under `src/app/[locale]/(site)/…`; `generateStaticParams` is not used (dynamic DB content). In `[locale]/layout.tsx`, `notFound()` if `locale` not in `LOCALES`; set `<html lang={locale}>`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit** `feat(i18n): ET at root, RU under /ru, typed dictionaries`.

---

### Task 3: Database schema, client, migrations

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `drizzle/` (generated)
- Test: `tests/db/schema.test.ts`, `tests/db/helpers.ts`

**Interfaces (produces):** tables + inferred types `Course`, `CourseImage`, `CourseSession`, `Registration`, `Request`, `PracticePackage`, `HeroSlide`, `FaqItem`, `Post`, `Page`, `GalleryItem`, `Campaign`, `Subscriber`, `Setting`, `AuthToken`, `AdminSession`; `getDb(): Db` (request-scoped, Hyperdrive); `type Db = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>`; test helper `makeTestDb(): Promise<Db>` (PGlite + migrations).

- [ ] **Step 1: schema.ts**

```ts
import { pgTable, serial, text, integer, boolean, jsonb, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { I18n } from "@/i18n/field";

export const courseType = pgEnum("course_type", ["e_learning", "contact"]);
export const courseLevel = pgEnum("course_level", ["basic", "advanced"]);
export const regStatus = pgEnum("registration_status", ["awaiting_prepayment", "confirmed", "cancelled"]);
export const regKind = pgEnum("registration_kind", ["group", "individual"]);
export const payChoice = pgEnum("payment_choice", ["full", "half"]);
export const sessionStatus = pgEnum("session_status", ["scheduled", "cancelled"]);
export const requestKind = pgEnum("request_kind", ["contact", "individual", "practice", "waitlist"]);

export type Badge = { label: string; bg: string; fg: string } | null;

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  type: courseType("type").notNull(),
  level: courseLevel("level").notNull(),
  title: jsonb("title").$type<I18n>().notNull(),
  summary: jsonb("summary").$type<I18n>().notNull(),
  body: jsonb("body").$type<I18n>().notNull(),
  outcomes: jsonb("outcomes").$type<I18n[]>().notNull().default([]),
  includes: jsonb("includes").$type<I18n[]>().notNull().default([]),
  modules: jsonb("modules").$type<I18n[]>().notNull().default([]),
  language: text("language").notNull().default("ET"),        // "ET" | "RU" | "ET / RU"
  price: integer("price"),                                     // e-learning, cents
  priceGroup: integer("price_group"),                          // contact, cents
  priceIndividual: integer("price_individual"),                // contact, cents
  accessMonths: integer("access_months"),
  videoCount: integer("video_count"),
  durationLabel: jsonb("duration_label").$type<I18n>(),        // e.g. {et:"8 ak"}
  nextDiscount: jsonb("next_discount").$type<I18n>(),
  badge: jsonb("badge").$type<Badge>(),
  recommendationIds: jsonb("recommendation_ids").$type<number[]>().notNull().default([]),
  published: boolean("published").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  isSample: boolean("is_sample").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("courses_slug").on(t.slug)]);

export const courseImages = pgTable("course_images", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  key: text("key").notNull(),                                  // R2 key or "/seed/…" static path
  alt: jsonb("alt").$type<I18n>(),
  sort: integer("sort").notNull().default(0),
}, (t) => [index("course_images_course").on(t.courseId)]);

export const courseSessions = pgTable("course_sessions", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  city: text("city").notNull(),
  venue: text("venue").notNull().default(""),
  language: text("language").notNull().default("ET"),
  capacity: integer("capacity").notNull().default(4),
  status: sessionStatus("status").notNull().default("scheduled"),
});

export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id),
  courseSessionId: integer("course_session_id").references(() => courseSessions.id),
  kind: regKind("kind").notNull(),
  name: text("name").notNull(), email: text("email").notNull(), phone: text("phone").notNull().default(""),
  paymentChoice: payChoice("payment_choice").notNull(),
  wantsModelHelp: boolean("wants_model_help").notNull().default(false),
  wantsAccount: boolean("wants_account").notNull().default(false),
  preferredPeriod: text("preferred_period").notNull().default(""),
  message: text("message").notNull().default(""),
  locale: text("locale").notNull().default("et"),
  status: regStatus("status").notNull().default("awaiting_prepayment"),
  paidCents: integer("paid_cents").notNull().default(0),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  kind: requestKind("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, string | boolean | number>>().notNull(),
  handled: boolean("handled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const practicePackages = pgTable("practice_packages", {
  code: text("code").primaryKey(),                             // "MINI" | "MAXI"
  name: jsonb("name").$type<I18n>().notNull(),
  tagline: jsonb("tagline").$type<I18n>().notNull(),
  models: integer("models").notNull(),
  durationLabel: jsonb("duration_label").$type<I18n>().notNull(),
  price: integer("price").notNull(),
  items: jsonb("items").$type<I18n[]>().notNull().default([]),
  sort: integer("sort").notNull().default(0),
});

export const heroSlides = pgTable("hero_slides", {
  id: serial("id").primaryKey(),
  imageKey: text("image_key").notNull(), imagePos: text("image_pos").notNull().default("50% 50%"),
  imagePosMobile: text("image_pos_mobile").notNull().default("50% 50%"),
  tone: text("tone").$type<"light" | "dark">().notNull().default("light"),
  kicker: jsonb("kicker").$type<I18n>().notNull(), title: jsonb("title").$type<I18n>().notNull(),
  text: jsonb("text").$type<I18n>().notNull(),
  ctaLabel: jsonb("cta_label").$type<I18n>().notNull(), ctaHref: text("cta_href").notNull(),
  active: boolean("active").notNull().default(true), sort: integer("sort").notNull().default(0),
});

export const faq = pgTable("faq", { id: serial("id").primaryKey(), q: jsonb("q").$type<I18n>().notNull(), a: jsonb("a").$type<I18n>().notNull(), sort: integer("sort").notNull().default(0) });

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(), slug: text("slug").notNull(),
  title: jsonb("title").$type<I18n>().notNull(), excerpt: jsonb("excerpt").$type<I18n>().notNull(),
  body: jsonb("body").$type<I18n>().notNull(), category: jsonb("category").$type<I18n>().notNull(),
  coverKey: text("cover_key").notNull(), publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  published: boolean("published").notNull().default(false),
}, (t) => [uniqueIndex("posts_slug").on(t.slug)]);

export const pages = pgTable("pages", { key: text("key").primaryKey(), title: jsonb("title").$type<I18n>().notNull(), body: jsonb("body").$type<I18n>().notNull() });
// keys: "trainer_bio", "center_story", "trainer_journey", "privacy", "terms", "statement"

export const galleryItems = pgTable("gallery_items", { id: serial("id").primaryKey(), group: text("group").notNull(), key: text("key").notNull(), alt: jsonb("alt").$type<I18n>(), sort: integer("sort").notNull().default(0) });
// group: "trainer_works"

export const campaign = pgTable("campaign", {
  id: integer("id").primaryKey().default(1), active: boolean("active").notNull().default(true),
  kicker: jsonb("kicker").$type<I18n>().notNull(), title: jsonb("title").$type<I18n>().notNull(), text: jsonb("text").$type<I18n>().notNull(),
  code: text("code").notNull().default(""), ctaLabel: jsonb("cta_label").$type<I18n>().notNull(), ctaHref: text("cta_href").notNull(),
  imageKey: text("image_key").notNull(),
});

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(), email: text("email").notNull(), locale: text("locale").notNull().default("et"),
  token: text("token").notNull(), consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("subscribers_email").on(t.email)]);

export const settings = pgTable("settings", { key: text("key").primaryKey(), value: jsonb("value").notNull() });
// keys: "contact" {email, phone, address, instagram, facebook}, "newsletter" {discountLabel}, "trainer" {portraitKey, name, role: I18n, stats: [{value,label:I18n}]}

export const authTokens = pgTable("auth_tokens", { hash: text("hash").primaryKey(), email: text("email").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), usedAt: timestamp("used_at", { withTimezone: true }) });
export const adminSessions = pgTable("admin_sessions", { idHash: text("id_hash").primaryKey(), email: text("email").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull() });

export type Course = typeof courses.$inferSelect; export type CourseSession = typeof courseSessions.$inferSelect;
export type Registration = typeof registrations.$inferSelect; export type PracticePackage = typeof practicePackages.$inferSelect;
export type HeroSlide = typeof heroSlides.$inferSelect; export type Post = typeof posts.$inferSelect; export type Campaign = typeof campaign.$inferSelect;
```
- [ ] **Step 2: client.ts**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";
export type Db = ReturnType<typeof drizzle<typeof schema>>;
// Hyperdrive pools connections; create a small client per request.
export function getDb(): Db {
  const { env } = getCloudflareContext();
  const sql = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
  return drizzle(sql, { schema });
}
```
(Tests pass a PGlite drizzle instance into query functions; query functions take `db` as first parameter and never call `getDb()` themselves.)
- [ ] **Step 3: drizzle.config.ts** — `export default { schema: "./src/db/schema.ts", out: "./drizzle", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL! } }`.
- [ ] **Step 4: Generate migration** `npm run db:generate` → `drizzle/0000_*.sql` created.
- [ ] **Step 5: Test helper + failing test**

```ts
// tests/db/helpers.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
export async function makeTestDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as import("@/db/client").Db;
}
// tests/db/schema.test.ts
import { expect, test } from "vitest"; import { makeTestDb } from "./helpers"; import { courses } from "@/db/schema";
test("migrations apply and a course round-trips", async () => {
  const db = await makeTestDb();
  await db.insert(courses).values({ slug: "x", type: "contact", level: "basic", title: { et: "X" }, summary: { et: "" }, body: { et: "" } });
  const rows = await db.select().from(courses);
  expect(rows[0].title.et).toBe("X");
  expect(rows[0].published).toBe(false);
});
```
- [ ] **Step 6:** `npm test` → PASS.
- [ ] **Step 7: Apply to Railway** `DATABASE_URL=<public url from railway.json, via env, not echoed> npm run db:migrate` → tables created.
- [ ] **Step 8: Commit** `feat(db): schema, Hyperdrive client, migrations, PGlite test helper`.

---

### Task 4: Domain rules (pure, TDD)

**Files:**
- Create: `src/domain/course.ts`, `src/domain/sessions.ts`, `src/domain/registration.ts`, `src/domain/recommend.ts`, `src/domain/money.ts`
- Test: `tests/unit/domain.test.ts`

**Interfaces (produces):**
```ts
export function formatEUR(cents: number, l: Locale): string;                       // money.ts: 10000 → "100 €" (et), "100 €" (ru); 9950 → "99,50 €"
export type PriceOption = { kind: "full" | "group" | "individual"; cents: number };
export function priceOptions(c: Pick<Course,"type"|"price"|"priceGroup"|"priceIndividual">): PriceOption[];
export function fromPrice(c: …): number | null;                                     // lowest available
export function participationKinds(c: …): ("group"|"individual")[];                  // contact only
export function prepaymentDue(cents: number, choice: "full"|"half"): number;          // half → ceil(cents/2)
export function registrationStatusAfterPayment(r: {status: RegStatus; paidCents: number}, totalCents: number): RegStatus;
export type SeatState = "open" | "few" | "full" | "cancelled";
export function seatsLeft(capacity: number, confirmed: number): number;
export function seatState(s: {status: "scheduled"|"cancelled"; capacity: number}, confirmed: number): SeatState;
export function recommend(current: Course, all: Course[], n?: number): Course[];
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, test } from "vitest";
import { formatEUR } from "@/domain/money";
import { priceOptions, fromPrice, participationKinds } from "@/domain/course";
import { prepaymentDue, registrationStatusAfterPayment } from "@/domain/registration";
import { seatsLeft, seatState } from "@/domain/sessions";
import { recommend } from "@/domain/recommend";

const base = { id: 1, slug: "a", level: "basic", published: true, sort: 0, recommendationIds: [] } as any;

describe("money", () => {
  test("formats euros Estonian style", () => { expect(formatEUR(10000, "et")).toBe("100 €"); expect(formatEUR(9950, "et")).toBe("99,50 €"); });
});
describe("course prices", () => {
  test("e-learning has one full price, no participation kinds", () => {
    const c = { ...base, type: "e_learning", price: 19000, priceGroup: null, priceIndividual: null };
    expect(priceOptions(c)).toEqual([{ kind: "full", cents: 19000 }]);
    expect(participationKinds(c)).toEqual([]);
  });
  test("contact lists group and individual separately and ignores missing", () => {
    const c = { ...base, type: "contact", price: null, priceGroup: 35000, priceIndividual: 45000 };
    expect(priceOptions(c)).toEqual([{ kind: "group", cents: 35000 }, { kind: "individual", cents: 45000 }]);
    expect(fromPrice(c)).toBe(35000);
    expect(participationKinds({ ...c, priceIndividual: null })).toEqual(["group"]);
  });
  test("contact never offers a full e-learning price (no hybrid)", () => {
    expect(priceOptions({ ...base, type: "contact", price: 19000, priceGroup: 35000, priceIndividual: null }).map((p) => p.kind)).toEqual(["group"]);
  });
});
describe("registration", () => {
  test("prepayment due", () => { expect(prepaymentDue(35000, "full")).toBe(35000); expect(prepaymentDue(35001, "half")).toBe(17501); });
  test("confirmed only at >= 50% paid", () => {
    expect(registrationStatusAfterPayment({ status: "awaiting_prepayment", paidCents: 0 }, 35000)).toBe("awaiting_prepayment");
    expect(registrationStatusAfterPayment({ status: "awaiting_prepayment", paidCents: 17499 }, 35000)).toBe("awaiting_prepayment");
    expect(registrationStatusAfterPayment({ status: "awaiting_prepayment", paidCents: 17500 }, 35000)).toBe("confirmed");
    expect(registrationStatusAfterPayment({ status: "cancelled", paidCents: 35000 }, 35000)).toBe("cancelled");
  });
});
describe("sessions", () => {
  test("seats", () => { expect(seatsLeft(4, 1)).toBe(3); expect(seatsLeft(4, 6)).toBe(0); });
  test("state", () => {
    expect(seatState({ status: "scheduled", capacity: 6 }, 2)).toBe("open");
    expect(seatState({ status: "scheduled", capacity: 6 }, 4)).toBe("few");
    expect(seatState({ status: "scheduled", capacity: 6 }, 6)).toBe("full");
    expect(seatState({ status: "cancelled", capacity: 6 }, 0)).toBe("cancelled");
  });
});
describe("recommend", () => {
  const mk = (id: number, type: string, level: string, sort = id) => ({ ...base, id, slug: "c" + id, type, level, sort });
  const all = [mk(1, "contact", "basic"), mk(2, "contact", "basic"), mk(3, "e_learning", "basic"), mk(4, "contact", "advanced"), { ...mk(5, "contact", "basic"), published: false }];
  test("same type+level first, excludes self and unpublished", () => expect(recommend(all[0], all, 3).map((c) => c.id)).toEqual([2, 4, 3]));
  test("manual override wins", () => expect(recommend({ ...all[0], recommendationIds: [3] }, all, 3).map((c) => c.id)).toEqual([3, 2, 4]));
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implement**

```ts
// money.ts
import type { Locale } from "@/i18n/locales";
export function formatEUR(cents: number, _l: Locale): string {
  const whole = cents % 100 === 0;
  const n = (cents / 100).toLocaleString("et-EE", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return `${n.replace(/ /g, " ")} €`;
}
// course.ts
import type { Course } from "@/db/schema";
type P = Pick<Course, "type" | "price" | "priceGroup" | "priceIndividual">;
export type PriceOption = { kind: "full" | "group" | "individual"; cents: number };
export function priceOptions(c: P): PriceOption[] {
  if (c.type === "e_learning") return c.price != null ? [{ kind: "full", cents: c.price }] : [];
  const out: PriceOption[] = [];
  if (c.priceGroup != null) out.push({ kind: "group", cents: c.priceGroup });
  if (c.priceIndividual != null) out.push({ kind: "individual", cents: c.priceIndividual });
  return out;
}
export function fromPrice(c: P): number | null { const o = priceOptions(c); return o.length ? Math.min(...o.map((x) => x.cents)) : null; }
export function participationKinds(c: P): ("group" | "individual")[] { return priceOptions(c).filter((o) => o.kind !== "full").map((o) => o.kind as "group" | "individual"); }
// registration.ts
export type RegStatus = "awaiting_prepayment" | "confirmed" | "cancelled";
export function prepaymentDue(cents: number, choice: "full" | "half"): number { return choice === "full" ? cents : Math.ceil(cents / 2); }
// Maria: a place is confirmed only after at least 50% has been paid.
export function registrationStatusAfterPayment(r: { status: RegStatus; paidCents: number }, totalCents: number): RegStatus {
  if (r.status === "cancelled") return "cancelled";
  return r.paidCents * 2 >= totalCents ? "confirmed" : "awaiting_prepayment";
}
// sessions.ts
export type SeatState = "open" | "few" | "full" | "cancelled";
export function seatsLeft(capacity: number, confirmed: number): number { return Math.max(0, capacity - confirmed); }
export function seatState(s: { status: "scheduled" | "cancelled"; capacity: number }, confirmed: number): SeatState {
  if (s.status === "cancelled") return "cancelled";
  const left = seatsLeft(s.capacity, confirmed);
  return left === 0 ? "full" : left <= 2 ? "few" : "open";
}
// recommend.ts
import type { Course } from "@/db/schema";
export function recommend(current: Course, all: Course[], n = 3): Course[] {
  const pool = all.filter((c) => c.published && c.id !== current.id);
  const manual = current.recommendationIds.map((id) => pool.find((c) => c.id === id)).filter(Boolean) as Course[];
  const score = (c: Course) => (c.type === current.type ? 2 : 0) + (c.level === current.level ? 1 : 0);
  const rest = pool.filter((c) => !manual.includes(c)).sort((a, b) => score(b) - score(a) || a.sort - b.sort);
  return [...manual, ...rest].slice(0, n);
}
```
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(domain): price options, prepayment rule, seat state, recommendations`.

---

### Task 5: Queries + seed content

**Files:**
- Create: `src/db/queries/public.ts`, `src/db/queries/admin.ts`, `src/db/seed.ts`, `public/seed/*` (copied prototype images, metadata stripped with `tools/strip_provenance.py` adapted to `app/public`)
- Create: `src/lib/media.ts`
- Test: `tests/db/queries.test.ts`

**Interfaces (produces):**
```ts
export function mediaUrl(key: string): string;   // "/seed/x.jpg" → same; "img/abc.jpg" → "/media/img/abc.jpg"
// public.ts (all take db first)
listPublishedCourses(db): Promise<(Course & { images: CourseImage[] })[]>
getCourseBySlug(db, slug): Promise<(Course & { images: CourseImage[]; sessions: (CourseSession & { confirmed: number })[] }) | null>
listUpcomingSessions(db, fromDate: Date): Promise<(CourseSession & { course: Course; confirmed: number })[]>
getHomeData(db): Promise<{ slides: HeroSlide[]; courses: …; faq: FaqItem[]; posts: Post[]; practice: PracticePackage[]; pages: Record<string, Page>; settings: Record<string, unknown>; campaign: Campaign | null }>
listPosts(db), getPost(db, slug), getPage(db, key), getGallery(db, group), getSettings(db), getPracticePackages(db)
// admin.ts
upsertCourse(db, input), replaceCourseImages(db, courseId, keys: {key:string; alt?: I18n}[]), upsertSession(db, input), setRegistrationStatus(db, id, status, note),
listRegistrations(db, filter: { type?: "e_learning"|"contact"; status?: RegStatus }), listRequests(db, kind?), markRequestHandled(db, id),
upsertPracticePackage, upsertHeroSlide, deleteHeroSlide, upsertFaq, deleteFaq, upsertPost, upsertPage, replaceGallery, upsertCampaign, setSetting, listSubscribers
```
`confirmed` counts registrations with `status = 'confirmed'` per session (SQL `count(*) filter (where status='confirmed')`).

- [ ] **Step 1: Failing test** (PGlite): insert 2 courses (one unpublished), a session with capacity 4 and registrations `confirmed`, `awaiting_prepayment`, `confirmed`; assert `listPublishedCourses` returns 1, `getCourseBySlug(...).sessions[0].confirmed === 2`, `listRegistrations(db,{type:"contact"})` returns 3 sorted newest first, `getCourseBySlug(db,"missing")` → null.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement with Drizzle query builder (`db.query.courses.findMany({ where, with })` requires relations — define `relations()` in schema.ts for courses→images, courses→sessions, sessions→course). **Step 4:** run → PASS.
- [ ] **Step 5: Seed** `src/db/seed.ts` (idempotent: truncates content tables only when `--reset` passed) with content taken from the prototypes, all courses `isSample: true`:
  - Courses (slugs, type, level, prices in cents): `kulmumeistri-baaskoolitus` contact basic group 35000 / individual 45000, duration "2 päeva · 16 ak"; `lash-lift-botox` contact basic 29000 / 39000, "8 ak"; `kulmude-lami` contact advanced 22000 / 30000, "6 ak"; `kulmumeistri-e-koolitus` e_learning basic 19000, access 6 months, 24 videos, 6 modules, next discount "−10% järgmiselt koolituselt"; `kulmukuju-ja-summeetria` e_learning advanced 9500, 6 months, 8 videos, 3 modules; `ripsmete-laminatsiooni-alused` e_learning basic 15000, 6 months, 12 videos, 4 modules. Texts from B `detail()` and D `COURSES` (ET + RU where B has RU). Contact `includes` = the eight items of checklist P10 verbatim.
  - Sessions: the 8 rows of D `SESS` mapped onto the three contact courses (dates in Nov 2026–Jan 2027, cities Pärnu/Tallinn/Tartu/Viljandi, languages ET / RU / ET / RU), capacity 4–6, one `cancelled`.
  - Practice: MINI (2 models, "4 ak", 10000, items from B `practicePanel`), MAXI (4 models, "8 ak", 15000).
  - Hero slides: B's five slides from `hero()` (ET+RU), tones light, dark, dark, light, light; first slide image `flower-hero-hd` (H1).
  - FAQ: D `FAQ` six items. Posts: D `NEWS` six items (slugs from titles). Pages: `statement` (D statement), `trainer_bio` (D trainer text), `center_story`, `trainer_journey` (placeholder paragraph marked "Maria täiendab"), `privacy`, `terms` (placeholder marked). Gallery `trainer_works`: Maria's real photos (`real/r1..r7` from `site/p/a/assets/real`, plus `cert-*`, `manual`, `gift`). Campaign: D defaults with CTA label "Leia enda koolitus" (M4). Settings: contact (info@mslab.ee placeholder), newsletter `{discountLabel:"10%"}`, trainer `{name:"Maria Sosnina", role, stats:[8+ aastat, 4 linna, 1:4 grupp]}`.
- [ ] **Step 6:** run seed against Railway (`DATABASE_URL` from env) → prints counts.
- [ ] **Step 7: Commit** `feat(db): public/admin queries and prototype seed content`.

---

### Task 6: Site shell — header, footer with newsletter, layout

**Files:**
- Create: `src/app/[locale]/(site)/layout.tsx`, `src/components/site/Header.tsx` + `.module.css`, `MobileMenu.tsx`, `Footer.tsx` + `.module.css`, `Newsletter.tsx` (client), `LangSwitch.tsx`, `Logo.tsx`
- Copy: `site/p/d/assets/logo-trim.png` → `public/brand/logo.png`
- Test: `tests/e2e/shell.spec.ts`

**Interfaces:** `Header({ locale, overHero }: { locale: Locale; overHero: boolean })`; hero publishes its current tone through `document.documentElement.dataset.heroTone = "light" | "dark"` (Task 7); header reads it with a `MutationObserver`. `Footer({ locale, newsletter })`.

Requirements (checklist): G3, G4, G5, H13, G8.
- Header markup/spacing copied from B `header()` + `.site-header` CSS: logo left (same size as B), nav center (Koolitused, Koolituskalender, Praktika, Koolitaja, Uudised), right: ET / RU switch, cart icon with count (count = 0 until phase 2), "Logi sisse" pill (links to `/konto` placeholder page saying "Õppija konto avaneb peagi" until phase 2), burger < 1100px.
- Fonts: nav, login and language switch use `var(--font-body)` (Manrope) 500 15px — this is Maria's only header change (G4).
- On home: transparent over hero, colour from hero tone; after scrolling past 40px → white background, ink text, subtle bottom line, sticky (B behaviour, G3). Other pages: white, sticky.
- Footer: B `footer()` structure (logo, slogan, three link columns) with B `newsletter()` block placed **inside the footer** above the link columns, keeping its lilac surface and white/ink/lilac combination and the sentence "Hea järgmine samm. Otse sinu postkasti." (H13). Newsletter form posts to Task 10 action `subscribe`.
- [ ] **Step 1: E2E test**

```ts
import { test, expect } from "@playwright/test";
test("header and footer", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "Koolitused" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Logi sisse" })).toBeVisible();
  const navFont = await header.getByRole("link", { name: "Koolitused" }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(navFont).toMatch(/Manrope/i);
  await page.mouse.wheel(0, 900); await page.waitForTimeout(400);
  expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect(page.locator("footer").getByText("Otse sinu postkasti.")).toBeVisible();
  await page.goto("/ru"); await expect(page.locator("header").getByRole("link", { name: "Курсы" })).toBeVisible();
});
```
- [ ] **Step 2:** run (`npm run e2e -- shell`) → FAIL. **Step 3:** implement. **Step 4:** run → PASS at 1440; also run project `mobile` (390) → burger menu opens and lists the five links.
- [ ] **Step 5: Commit** `feat(site): header (B, Manrope UI font), footer with newsletter`.

---

### Task 7: Home page

**Files:**
- Create: `src/app/[locale]/(site)/page.tsx`; components `Hero.tsx` (client), `SlideControl.tsx`, `FormatsBlock.tsx` (client tabs), `Steps.tsx` + css, `CourseCard.tsx`, `Statement.tsx`, `TrainerTeaser.tsx`, `PracticeBlock.tsx`, `BlogCarousel.tsx` (client), `Faq.tsx`, `ContactBlock.tsx` (client form)
- Test: `tests/e2e/home.spec.ts`

Requirements: H1–H12, H14–H17, G5, K12. Section order: Hero → upcoming strip (3 next sessions) → course cards ("Vali oma koolitus", 4 cards) → FormatsBlock ("Kuidas soovid õppida?") → Statement → TrainerTeaser → PracticeBlock → BlogCarousel → Faq → ContactBlock. (Newsletter is in the footer.)

- **Hero** = B `hero()` markup and CSS (full-bleed, H5), slides from DB, keep vertical "BROW & LASH ACADEMY" text (H4), first slide B flower image (H1). Buttons: primary filled pill "Leia oma koolitus →" (H6); secondary **outline pill: transparent, 1px solid currentColor (ink on light, white on dark), same height/radius as primary, arrow → pointing right** "Vaata koolituskalendrit →" (H3). Writes `document.documentElement.dataset.heroTone` on slide change (G5). Autoplay 6.5 s with pause on hover/focus; swipe; arrow keys.
- **SlideControl** = A's control (copy from `site/p/a/index.html`: mono `0N / 05`, five 2px segments with inactive opacity .25, filled segment = current, prev outline round 44px + next filled round 44px) replacing B's (H2).
- **FormatsBlock** = D `pHome` "Kuidas soovid õppida?" + `fmtPanel` (H7) with tabs E-õpe / Kontaktõpe / Hübriidõpe; hybrid panel shows description only, no steps (K8); copy Maria's e-learning steps verbatim (K11).
- **Steps** (shared with catalogue): `<ol data-steps>` of 5 `<li>`; each li has `<span data-step-num>` (circle 52px, mono number) and, except the last, `<span data-step-line aria-hidden>` (dotted connector). **The whole row is centred in its box** (`display:grid; grid-template-columns:repeat(5,1fr); justify-items:center; text-align:center`); the connector is absolutely positioned at `top: 25px` (circle centre minus half the 2px line) from `left: calc(50% + 26px)` to `right: calc(-50% + 26px)`, i.e. from this circle's edge to the next circle's edge **through the centres** (K5); last circle filled ink. Under 860px the list is vertical with the connector at `left: 21px` (centre of 44px circles).
- **Statement** = D statement, font-size `clamp(22px, 2.6vw, 36px)` (smaller than D's 46px max) (H8).
- **TrainerTeaser** = D trainer block (portrait, "Sinu koolitaja", name, text, stats, link to `/koolitaja`) (H9).
- **PracticeBlock** = B `practicePanel()` layout and dark panel. Changes: top line is a large Jost heading **"Praktika"** (e.g. `clamp(40px,5vw,64px)`), with "Individuaalpraktika · ainult Pärnus" eyebrow; B's slogan "Teadmised muutuvad oskusteks." and text become secondary (smaller, H11). Each package card shows **duration chip "≈ 8 ak"** from `durationLabel` (H10). Price uses Jost 400 `28px` (B is larger/other font) (H12). Button "Registreeru" → `/praktika#taotlus?pakett=MINI`.
- **BlogCarousel** = D dark blog panel (H16), cards link to `/uudised/[slug]`.
- **Faq** = D FAQ details/summary (H14). **ContactBlock** = D contact block with working form → action `submitContact` (Task 10) (H15).
- [ ] **Step 1: E2E test**

```ts
test("home sections and Maria's hero changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("BROW & LASH ACADEMY")).toBeVisible();
  await expect(page.getByText(/^01 \/ 0\d$/)).toBeVisible();                                   // A slide counter
  const cal = page.getByRole("link", { name: /Vaata koolituskalendrit/ });
  const s = await cal.evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, bw: c.borderTopWidth, r: c.borderTopLeftRadius }; });
  expect(s.bg).toBe("rgba(0, 0, 0, 0)"); expect(s.bw).toBe("1px"); expect(parseFloat(s.r)).toBeGreaterThan(20);
  await expect(page.getByRole("heading", { name: "Kuidas soovid õppida?" })).toBeVisible();
  await page.getByRole("tab", { name: "Hübriidõpe" }).click();
  await expect(page.locator("[data-steps]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Praktika", exact: true })).toBeVisible();
  await expect(page.getByText(/ak$/).first()).toBeVisible();
  await expect(page.getByText("Korduma kippuvad küsimused")).toBeVisible();
  await expect(page.getByText("Ei tea, milline koolitus sobib?")).toBeVisible();
});
test("steps are centred and the line passes through circle centres", async ({ page }) => {
  await page.goto("/");
  const geo = await page.locator("[data-steps] li").evaluateAll((lis) => lis.map((li) => {
    const n = li.querySelector("[data-step-num]")!.getBoundingClientRect(); const l = li.getBoundingClientRect();
    const line = li.querySelector("[data-step-line]")?.getBoundingClientRect();
    return { cx: n.left + n.width / 2, lc: l.left + l.width / 2, cy: n.top + n.height / 2, ly: line ? line.top + line.height / 2 : null };
  }));
  for (const g of geo) { expect(Math.abs(g.cx - g.lc)).toBeLessThan(1.5); if (g.ly !== null) expect(Math.abs(g.ly - g.cy)).toBeLessThan(1.5); }
  const box = await page.locator("[data-steps]").boundingBox(); const parent = await page.locator("[data-steps]").evaluate((e) => e.parentElement!.getBoundingClientRect().toJSON());
  expect(Math.abs((box!.x + box!.width / 2) - (parent.x + parent.width / 2))).toBeLessThan(2);   // row centred in its box
});
```
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS at 1440 and 390.
- [ ] **Step 5: Commit** `feat(site): home page with Maria's section decisions`.

---

### Task 8: Catalogue and course pages

**Files:**
- Create: `src/app/[locale]/(site)/koolitused/page.tsx`, `koolitused/[slug]/page.tsx`; components `CatalogueFilters.tsx` (client), `FormatExplainer.tsx`, `Gallery.tsx` (client: main image + thumbnail carousel), `Lightbox.tsx` (client, focus trap, Esc, arrows), `CourseSummary.tsx`, `ELearningBuy.tsx` (client), `ContactRegister.tsx` (client), `ShareButton.tsx` (client), `FavouriteButton.tsx` (client, localStorage key `mslab-fav`), `Recommendations.tsx`, `ModuleList.tsx`, `IncludesList.tsx`, `TrainerLink.tsx`
- Test: `tests/e2e/catalogue.spec.ts`, `tests/e2e/course.spec.ts`

Catalogue (K1–K13): heading "Leia oma koolitus." at `clamp(34px,4vw,52px)` (smaller than D, K9); intro `17px` (K10); search; **row 1** format chips Kõik / E-õpe / Kontaktõpe, **row 2** (separate, B spacing) level chips Kõik tasemed / Baaskoolitused / Täiendkoolitused (K3, K4); explainer: "Kõik" → D three cards Õppevormid (E-õpe, Kontaktõpe, Hübriidõpe) (K7); E-õpe/Kontaktõpe → "Sinu õppeteekond" panel with Steps (K5) and description `16px` (K6); Hübriidõpe card opens description only (K8) and does not filter (no hybrid courses exist). URL keeps `?vorm=e|k&tase=baas|taiend`. Cards: B `courseCard` with badge (K12), city/next date for contact, "Veebis · alusta kohe" for e-learning.

Course page (P1–P16), base B `detail()` layout:
- Left: **Gallery** — main image 5:4 + thumbnail carousel (4 visible desktop, 3 mobile, arrows, swipe); clicking main or thumb opens **Lightbox** (P2).
- Right: tags (type, level, language), H1, summary, **CourseSummary** card (P3): e-learning → modules count, video count, access "6 kuud", language, trainer link, next-course discount; contact → duration, language, trainer link, cities of upcoming sessions, next-course discount if set.
- E-learning (P8, P9): price; radio "Maksa kohe — 100% pangalingiga" (default) and "Vormista järelmaks — tulekul" (disabled, explanatory note); "Osta kohe" → `/ostukorv?kursus=slug` page that summarises and says "Makse lisandub peagi — saad koolituse osta niipea, kui makse on avatud. Jäta oma e-post, anname teada." with an interest form (stored as request kind `contact` with `{course, intent:"purchase"}`). Below: "Koolitus sisaldab": video count, materials, **teadmiste test**, **praktilise töö hindamine**, **tunnistus pärast edukat lõpetamist**; module list with lock icons (not clickable).
- Contact (P10–P16): participation switch **Grupikoolitus** / **Individuaalkoolitus** (only kinds with a price; P12, P13) each with its own price. Group → list of sessions (date, city, language tag, seat state from `seatState`) to pick → form. Individual → request form with "Soovitud periood või kuupäev". Form fields: name, e-mail, phone, payment **100% kohe** / **50% registreerimisel + 50% koolituspäeval** (P14), ☐ "Soovin koolituskeskuse abi modellide leidmisel" (P11), ☐ "Loo mulle kohe konto MS LAB keskkonda" (P16), ☐ terms (required). Info line under the button: "Koht kinnitatakse pärast vähemalt 50% ettemaksu laekumist." (P15). Success screen: "Registreerimine on vastu võetud. Saadame sulle e-postiga makse juhised; koht kinnitub pärast ettemaksu." Also show models note text (P11) and "Koolitus sisaldab" list (P10).
- Both: "Jaga koolitust" (Web Share API, fallback copy link + toast) (P4); ♡ "Lisa lemmikutesse" toggles localStorage (P6); trainer block with link `/koolitaja` (P7); outcomes; programme; **Recommendations** "Sulle võiksid huvi pakkuda" at the very bottom (P5).
- [ ] **Step 1: E2E tests**

```ts
test("catalogue filters are on separate rows and hybrid has no steps", async ({ page }) => {
  await page.goto("/koolitused");
  const f = await page.locator("[data-filter-row='format']").boundingBox(); const l = await page.locator("[data-filter-row='level']").boundingBox();
  expect(l!.y).toBeGreaterThan(f!.y + f!.height - 1);
  await page.getByRole("button", { name: "E-õpe" }).first().click();
  await expect(page.locator("[data-steps]")).toBeVisible();
  await expect(page.locator("[data-course-card][data-type='contact']")).toHaveCount(0);
  await page.getByRole("button", { name: /Hübriidõpe/ }).click();
  await expect(page.locator("[data-steps]")).toHaveCount(0);
});
test("e-learning course page", async ({ page }) => {
  await page.goto("/koolitused/kulmumeistri-e-koolitus");
  await expect(page.getByText(/Maksa kohe/)).toBeVisible();
  await expect(page.getByText(/järelmaks/i)).toBeVisible();
  await expect(page.getByText(/Grupikoolitus|Hübriid/)).toHaveCount(0);
  await expect(page.getByText(/praktilise töö hindamine/i)).toBeVisible();
  await expect(page.getByText("Sulle võiksid huvi pakkuda")).toBeVisible();
  await page.locator("[data-gallery-main]").click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
});
test("contact course group registration stays awaiting prepayment", async ({ page }) => {
  await page.goto("/koolitused/kulmumeistri-baaskoolitus");
  await expect(page.getByText(/E-õpe|Hübriidõpe/)).toHaveCount(0);
  await page.getByRole("radio", { name: /Grupikoolitus/ }).check();
  await page.locator("[data-session]:not([aria-disabled='true'])").first().click();
  await page.getByLabel("Nimi").fill("Test Õpilane"); await page.getByLabel("E-post").fill("test@example.com"); await page.getByLabel("Telefon").fill("+3725555555");
  await page.getByRole("radio", { name: /50%/ }).check(); await page.getByLabel(/modellide leidmisel/).check(); await page.getByLabel(/tingimustega/).check();
  await page.getByRole("button", { name: "Registreeru" }).click();
  await expect(page.getByText(/koht kinnitub pärast ettemaksu/)).toBeVisible();
});
```
- [ ] **Step 2:** FAIL → **Step 3:** implement (registration uses Task 10 action `registerContact`; build Task 10 first if executing strictly in order, or stub action returning `{ok:true}` and replace in Task 10) → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(site): catalogue and type-specific course pages`.

---

### Task 9: Calendar, practice, trainer, blog, contact, legal pages

**Files:**
- Create: `koolituskalender/page.tsx` + `CalendarRow.tsx`; `praktika/page.tsx` + `PracticeRequest.tsx`; `koolitaja/page.tsx` + `WorksGallery.tsx` (client carousel + Lightbox reuse); `uudised/page.tsx`, `uudised/[slug]/page.tsx`; `kontakt/page.tsx`; `privaatsus/page.tsx`, `tingimused/page.tsx`; `ostukorv/page.tsx` (from Task 8); `konto/page.tsx` placeholder
- Test: `tests/e2e/pages.spec.ts`

- **Calendar** (L1–L5): A layout (white rounded rows, city filter chips Kõik / Pärnu / Tallinn / Tartu / Viljandi). Row order: date block → **course name in Jost 26px (A's city size), first and dominant** → line with city (pin icon), venue → format "Kontaktõpe" · **language tag chip (ET / RU / ET+RU)** → seat state word + colour → action (Registreeru → course page with `?sessioon=id`; full → "Ootenimekirja" opens waitlist form → `requests` kind `waitlist`; cancelled → "Vaata teisi"). Only contact courses appear (e-learning has no dates).
- **Practice** (R1–R5): "Praktika" H1 first (H11), eyebrow "Ainult Pärnus" and a visible info row "Praktika toimub ainult Pärnus, MS LAB stuudios." (R4); intro; B dark panel with Maria's text and the praktikaprotokoll explanation (R2) and MINI/MAXI cards with duration chips and Jost prices (R5) and items from DB (R3); request form (`#taotlus`): name, e-mail, phone, package (preselected from `?pakett`), completed course, preferred times → `requests` kind `practice`.
- **Trainer** (T1–T4): D `pTrainer` base; under the portrait a **WorksGallery** carousel (3 per view desktop, 2 tablet, 1.2 mobile, arrows + swipe, click opens Lightbox) from `gallery_items` group `trainer_works`; sections "Koolituskeskuse lugu" (page `center_story`) and "Koolitaja teekond" (page `trainer_journey`) as two editorial blocks with a thin rose rule.
- **Blog** (B1): D `pNewsList` grid + `pArticle` article layout; RU fallback.
- **Contact**: settings contact data + D contact form.
- **Legal**: render pages `privacy`, `terms`.
- [ ] **Step 1: E2E**

```ts
test("calendar puts course name first and shows language", async ({ page }) => {
  await page.goto("/koolituskalender");
  const row = page.locator("[data-calendar-row]").first();
  const name = row.locator("[data-course-name]"); const city = row.locator("[data-city]");
  const [nf, cf] = await Promise.all([name.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)), city.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))]);
  expect(nf).toBeGreaterThan(cf);
  await expect(row.locator("[data-lang]")).toHaveText(/ET|RU/);
});
test("practice says Pärnu only and shows durations", async ({ page }) => {
  await page.goto("/praktika");
  await expect(page.getByText(/ainult Pärnus/i).first()).toBeVisible();
  await expect(page.getByText(/ak/).first()).toBeVisible();
});
test("trainer page has gallery, story and journey", async ({ page }) => {
  await page.goto("/koolitaja");
  await expect(page.getByText("Koolituskeskuse lugu")).toBeVisible();
  await expect(page.getByText("Koolitaja teekond")).toBeVisible();
  await page.locator("[data-works] img").first().click(); await expect(page.getByRole("dialog")).toBeVisible();
});
```
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(site): calendar, practice, trainer, blog, contact, legal pages`.

---

### Task 10: Forms backend — validation, rate limit, storage, notifications

**Files:**
- Create: `src/server/forms.ts` (Zod schemas), `src/server/ratelimit.ts`, `src/server/notify.ts`, `src/server/actions/public.ts` (`"use server"`), `src/app/api/newsletter/confirm/route.ts`
- Test: `tests/unit/forms.test.ts`, `tests/unit/ratelimit.test.ts`, `tests/db/actions.test.ts`

**Interfaces (produces):**
```ts
export const contactSchema, individualSchema, practiceSchema, waitlistSchema, registrationSchema, subscribeSchema;   // forms.ts (zod)
export async function rateLimit(kv: KVNamespace, key: string, limit: number, windowSec: number): Promise<boolean>;  // true = allowed
export async function notifyMaria(env: Env, subject: string, text: string): Promise<{ mail: boolean; telegram: boolean }>;
// actions/public.ts — each returns { ok: true } | { ok: false; errors: Record<string,string> }
submitContact(formData), submitIndividual(formData), submitPractice(formData), submitWaitlist(formData), registerContact(formData), subscribe(formData)
// core functions used by actions and tested without Next:
export async function createRegistration(db: Db, input: z.infer<typeof registrationSchema>): Promise<Registration>;   // always status awaiting_prepayment
```
Rules: honeypot field `website` must be empty (else pretend success, store nothing); rate limit 5 submissions / 10 min per IP+form (KV key `rl:<form>:<ip>`, TTL); storage first, then notify; notify failures logged, never fail the request. Telegram: reuse logic from `worker/index.js` (`chatId()` with KV `tg:chat`, `sendTelegram`). E-mail: Resend `emails.send({ from: env.MAIL_FROM, to: env.MARIA_EMAIL, subject, text })`, skipped when `RESEND_API_KEY` missing. Newsletter: double opt-in — store subscriber with token, e-mail confirm link `/api/newsletter/confirm?t=…` → sets `confirmedAt`, redirects to `/?uudiskiri=kinnitatud`.

- [ ] **Step 1: Failing tests**

```ts
// forms.test.ts
import { registrationSchema } from "@/server/forms";
test("registration requires terms and a session for group", () => {
  const base = { courseId: 1, kind: "group", name: "A B", email: "a@b.ee", phone: "+372 5555", paymentChoice: "half", terms: "on" };
  expect(registrationSchema.safeParse({ ...base, courseSessionId: 3 }).success).toBe(true);
  expect(registrationSchema.safeParse(base).success).toBe(false);
  expect(registrationSchema.safeParse({ ...base, courseSessionId: 3, terms: undefined }).success).toBe(false);
  expect(registrationSchema.safeParse({ ...base, kind: "individual", preferredPeriod: "november" }).success).toBe(true);
});
// ratelimit.test.ts — in-memory KV fake {get, put}: 5 allowed, 6th blocked
// db/actions.test.ts
test("createRegistration never confirms", async () => {
  const db = await makeTestDb(); /* insert contact course + session */
  const r = await createRegistration(db, { courseId: c.id, courseSessionId: s.id, kind: "group", name: "A", email: "a@b.ee", phone: "1", paymentChoice: "full", wantsModelHelp: true, wantsAccount: false, preferredPeriod: "", message: "", locale: "et" });
  expect(r.status).toBe("awaiting_prepayment"); expect(r.paidCents).toBe(0);
});
```
- [ ] **Step 2:** FAIL → **Step 3:** implement:

```ts
// forms.ts (excerpt)
import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
export const registrationSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  courseSessionId: z.coerce.number().int().positive().optional(),
  kind: z.enum(["group", "individual"]),
  name: text(120), email: z.string().trim().email().max(200), phone: text(40),
  paymentChoice: z.enum(["full", "half"]),
  wantsModelHelp: z.coerce.boolean().default(false), wantsAccount: z.coerce.boolean().default(false),
  preferredPeriod: z.string().trim().max(200).default(""), message: z.string().trim().max(2000).default(""),
  terms: z.literal("on"), locale: z.enum(["et", "ru"]).default("et"),
}).refine((v) => v.kind === "individual" || v.courseSessionId != null, { path: ["courseSessionId"], message: "session" });
// ratelimit.ts
export async function rateLimit(kv: Pick<KVNamespace, "get" | "put">, key: string, limit: number, windowSec: number) {
  const n = Number((await kv.get(key)) ?? "0");
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: windowSec });
  return true;
}
```
- [ ] **Step 4:** PASS. **Step 5:** wire actions into Tasks 7–9 forms (replace any stubs). **Step 6:** e2e from Task 8 passes against dev with Railway DB; the registration row exists with `awaiting_prepayment`; Telegram ping arrives.
- [ ] **Step 7: Commit** `feat(forms): validated, rate-limited submissions with Maria notifications`.

---

### Task 11: Admin authentication (magic link)

**Files:**
- Create: `src/server/auth.ts`, `src/app/admin/login/page.tsx`, `src/app/api/auth/request/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/admin/(panel)/layout.tsx` (guard)
- Test: `tests/db/auth.test.ts`, `tests/e2e/admin-auth.spec.ts`

**Interfaces (produces):**
```ts
export function isAllowedAdmin(email: string, allow: string): boolean;                       // case-insensitive, trimmed
export async function createLoginToken(db: Db, email: string, now?: Date): Promise<string>;   // raw token (32 bytes b64url); stores sha256 hash, expires +15 min
export async function consumeLoginToken(db: Db, raw: string, now?: Date): Promise<string | null>;  // email or null; single use
export async function createSession(db: Db, email: string, now?: Date): Promise<string>;      // raw session id; stores hash; expires +30 days
export async function getSessionEmail(db: Db, raw: string | undefined, now?: Date): Promise<string | null>;
export async function requireAdmin(): Promise<string>;                                       // reads cookie "mslab_admin", redirects to /admin/login
```
Flow: POST `/api/auth/request {email}` → always responds `{ok:true}` (no account enumeration); if allowed, store token and e-mail link `${SITE_URL}/api/auth/verify?t=…`. In non-production (`process.env.NODE_ENV !== "production"`) the response also includes `devLink` for tests. GET verify → consume → create session → cookie `mslab_admin` (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 30d) → redirect `/admin`. Rate limit 5 / 10 min per IP.
- [ ] **Step 1: Failing tests**

```ts
test("token is single use and expires", async () => {
  const db = await makeTestDb(); const now = new Date("2026-10-01T10:00:00Z");
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
  const db = await makeTestDb(); const s = await createSession(db, "dim@example.test");
  expect(await getSessionEmail(db, s)).toBe("dim@example.test"); expect(await getSessionEmail(db, "nope")).toBeNull();
});
```
- [ ] **Step 2:** FAIL → **Step 3:** implement with Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest("SHA-256")`) → **Step 4:** PASS. E2E: request link for allowed e-mail, follow `devLink`, land on `/admin` showing "Tere, Maria." / "Tere, Dim."; `/admin` without cookie redirects to `/admin/login`.
- [ ] **Step 5: Commit** `feat(admin): magic-link login for allow-listed e-mails`.

---

### Task 12: Admin shell, overview and inboxes

**Files:**
- Create: `src/components/admin/Shell.tsx`, `Sidebar.tsx` + css (B `adminShell()` layout and styles), `src/app/admin/(panel)/page.tsx` (overview), `registreerimised/page.tsx`, `paringud/page.tsx`, `uudiskiri/page.tsx` (+ CSV route `api/admin/subscribers.csv`), `src/server/actions/admin.ts` (each action calls `requireAdmin()` first)
- Test: `tests/e2e/admin-inbox.spec.ts`

Requirements: A1, A3, A4. Sidebar (B): Ülevaade · Koolitused · Kalender · Registreerimised · Päringud · Praktika · Avaleht · Koolitaja · Uudised · Kampaania · Uudiskiri · Seaded · Vaata lehte ↗ · Logi välja. Overview: greeting "Tere, Maria." (name from e-mail map), counts (new registrations, unhandled requests by kind, upcoming sessions next 30 days), quick links. Registrations page: filter buttons **Kõik / E-õpe / Kontaktõpe** at the top (A4; e-learning list stays empty until phase 2 — show "E-õppe ostud lisanduvad koos maksetega"), status filter, table (date, name, course, session, kind, payment choice, model help, wants account, status pill), detail drawer with status change (awaiting_prepayment / confirmed / cancelled) + note + `paidCents` input (manual confirmation for bank transfers; status computed with `registrationStatusAfterPayment` when paid amount saved). Requests page: tabs Kontakt / Individuaal / Praktika / Ootenimekiri (A3), mark handled.
- [ ] **Step 1: E2E**: logged-in admin sees the registration from Task 8's test under Kontaktõpe with status "Ootab ettemaksu"; entering paid 50% flips it to "Kinnitatud"; requests tab shows practice request.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(admin): B shell, overview, registrations and request inboxes`.

---

### Task 13: Admin content editors + R2 uploads

**Files:**
- Create: `src/server/media.ts`, `src/app/media/[...key]/route.ts`, `src/app/api/admin/upload/route.ts`, `src/components/admin/ImageUpload.tsx` (client: resize to ≤2400px via canvas, re-encode JPEG/WebP which strips metadata), `I18nInput.tsx` (ET/RU tabs), `ListEditor.tsx` (ordered list of I18n items), `BadgeEditor.tsx` (port D `adminBadges`), pages `koolitused/page.tsx`, `koolitused/[id]/page.tsx`, `kalender/page.tsx`, `praktika/page.tsx`, `avaleht/page.tsx` (hero slides incl. tone light/dark, statement, FAQ), `koolitaja/page.tsx` (bio, works gallery, story, journey), `uudised/page.tsx` + `[id]`, `kampaania/page.tsx` (port D `adminCamp` + ImageUpload), `seaded/page.tsx`
- Test: `tests/unit/media.test.ts`, `tests/e2e/admin-edit.spec.ts`

**Interfaces:** `putImage(env, file: File): Promise<{ key: string }>` validates `image/jpeg|png|webp`, ≤ 8 MB, key `img/<uuid>.<ext>`; `GET /media/img/<uuid>.<ext>` streams from R2 with `Cache-Control: public, max-age=31536000, immutable`.

Requirements: A2 (badge editor), A8 (practice durations/lists), A9 (hero tone), M2, M5 (campaign image upload), K12, R3, T2–T4. Course editor: type switch shows only that type's fields (e-learning: price, access months, video count, modules list, next discount; contact: group price, individual price, duration label, includes list); ET/RU inputs everywhere; gallery upload + drag/↑↓ order; badge editor with live course-card preview; recommendations multi-select; publish toggle; "Näidis" marker for `isSample`.
- [ ] **Step 1: Failing unit test** for upload validation (`putImage` rejects `text/html` and 9 MB, accepts 1 MB JPEG and returns key matching `/^img\/[0-9a-f-]{36}\.jpg$/`) with an in-memory R2 fake.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: E2E**: admin edits course title (ET) → public page shows it; sets badge "Uus" orchid → card shows badge; uploads campaign image → popup shows it; changes MAXI duration to "9 ak" → home practice card shows "≈ 9 ak"; switches slide 1 tone to dark → header turns white on that slide.
- [ ] **Step 6: Commit** `feat(admin): content editors, badge and campaign editors, R2 image upload`.

---

### Task 14: Campaign popup and favourites

**Files:**
- Create: `src/components/site/CampaignPopup.tsx` (client), `src/components/site/FavouriteButton.tsx` (if not done in Task 8), mount popup in `(site)/layout.tsx` with campaign data
- Test: `tests/e2e/campaign.spec.ts`

Requirements M1, M3, M4, P6. Port D `campHtml` + styles: image left, kicker, title, text, code chip with "Kopeeri", CTA from DB (default "Leia enda koolitus"), ✕ close; **no "Mitte praegu" button**; once per session (`sessionStorage` `mslab-camp`), only on `/` and `/ru` after 6 s, never on `/ostukorv`, `/admin`; Esc/backdrop close; focus trap; bottom sheet under 640px.
- [ ] **Step 1: E2E**: on `/`, wait 6.5 s → dialog visible with "Leia enda koolitus"; "Mitte praegu" count 0; reload → not shown again in same session; `/koolitused` → never shown.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(site): campaign popup per Maria's changes`.

---

### Task 15: Move the review hub and comment tool into the app

**Files:**
- Move: `site/guide` → `app/public/guide`, `site/p` → `app/public/p`, `site/feedback.js` → `app/public/feedback.js`, `site/robots.txt` → `app/public/robots.txt`
- Create: `src/app/api/feedback/route.ts`, `src/app/api/feedback/[id]/route.ts` (port of `worker/index.js` using `getCloudflareContext().env.KV` instead of `FEEDBACK`, same key format `fb:<at>:<id>` / `id:<id>`, same `x-key` admin check), `src/app/(site)` layout includes `<Script src="/feedback.js?v=3" strategy="afterInteractive" />` while `process.env.NEXT_PUBLIC_REVIEW_TOOLS === "1"`
- Modify: `public/feedback.js` — detect main-site pages: `DIR = path starts with /p/ ? letter : path starts with /guide ? "hub" : "site"`; add `site: "Põhileht"` to the Worker's `DIRS` map and make `placeLink` for `site` return `${origin}${route}?fb=${id}` where route = pathname (store `location.pathname` in `route` for site comments)
- Test: `tests/e2e/feedback.spec.ts`

- [ ] **Step 1:** Copy files; run `python tools/strip_provenance.py` with ROOT pointed at `app/public` (add CLI arg) → 0 matches.
- [ ] **Step 2: E2E**: `/guide/` 200 and shows four directions; `/p/d/` renders; POST a comment from `/koolitused` with the widget → GET `/api/feedback` with `x-key` lists it with dir `site`; list page `/guide/tagasiside/` still works.
- [ ] **Step 3:** implement → PASS. Delete the test comment from KV.
- [ ] **Step 4: Commit** `feat: host review hub and comment API inside the main app`.

---

### Task 16: Deploy, cut-over, verification against Maria's checklist

**Files:**
- Modify: `app/wrangler.jsonc` (add `"routes":[{"pattern":"mslab.diipsolutions.eu","custom_domain":true}]`), `app/next.config.ts` headers (`X-Robots-Tag: noindex, nofollow` for all paths), OG tags for `/` (reuse `/guide/og.jpg` style: new `public/og.jpg` rendered from home)
- Create: `tests/visual/shots.spec.ts` (screens of every public page at 390/834/1440/2560, asserting `scrollWidth <= clientWidth` and no console errors)
- Modify: `docs/feedback/2026-10-01-checklist.md` (tick verified items with evidence)

- [ ] **Step 1:** `npm test && npm run e2e` → all PASS locally.
- [ ] **Step 2:** `npx opennextjs-cloudflare deploy` to workers.dev; run e2e + visual suite against it (`BASE_URL=https://mslab-web.<acct>.workers.dev`).
- [ ] **Step 3:** Check every phase-1 item in `docs/feedback/2026-10-01-checklist.md` **twice**: once reading the checklist top to bottom against screenshots, once reading `2026-10-01-maria-comments-raw.md` C01–C54 against the live site. Fix gaps, redeploy.
- [ ] **Step 4: Cut-over:** remove the custom domain from `mslab-guide` (`wrangler.jsonc` at repo root: delete `routes`, deploy) and add it to `mslab-web` (deploy). Verify `https://mslab.diipsolutions.eu/` = new site, `/guide/` = hub, `/ru` = RU, `/admin/login` works, a comment from the main site reaches Telegram, `curl -I` shows `x-robots-tag: noindex`.
- [ ] **Step 5:** Run `tools/strip_provenance.py` over `app/public` and grep served HTML/JS for `claude|lovable|gpt|openai` → 0.
- [ ] **Step 6: Commit** `chore: deploy main site to mslab.diipsolutions.eu`, then update memory `mslab-project.md` (new architecture, worker names, how to deploy).
