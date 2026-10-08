# MS LAB Phase 2c — Maria's 06.10 Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maria's feedback of 06.10.2026, items 1 and 2: a lesson video cannot be skipped forward past what was watched, five look changes (menu font, equal page titles, the home news band, a footer of half the height, a "Pooleli" dashboard card), a newsletter popup with a welcome code sent after confirmation, marketing consent on the registration forms, and an optional password next to the e-mail code. Everything stays on Vercel Hobby, with no paid plan and no new dependency.

**Architecture:**
- **Video.** The page takes back a forward jump of more than 3 s with Player.js `setCurrentTime`. The real rule is on the server: a new column `lesson_progress.clock_at` lets the watched seconds grow by at most twice the real time since the lesson was opened plus 30 s, so a lesson cannot be completed in less than about half its length.
- **Data.** One additive migration `0005_phase2c.sql`: the progress clock, one `campaign` row per popup kind (at most one active), and two nullable password columns on `clients`. The welcome code is a setting.
- **Popup and newsletter.** The home page shows the one active popup row: the campaign card as today, or the newsletter card with the footer's sign-up form. The confirmation link's first use mails the welcome code and shows it on the confirmed page through the address's fragment.
- **Password.** `node:crypto` scrypt. `POST /api/konto/parool-login` starts the same one-device session as the code. One answer for every failure, with a lock in the Postgres KV store. `/konto…` stays static shells; personal data still comes only from `/api/konto/*`.

**Tech Stack:**
- Next.js 16.3.8 (pinned exactly — do not upgrade), React 19, TypeScript.
- Drizzle 0.45 + postgres.js 3.4 (Railway); PGlite for DB tests.
- Vitest (+ happy-dom for DOM tests), Playwright.
- `node:crypto` scrypt for passwords; Bunny Stream's Player.js protocol (`player-js.ts`); Resend for mail.
- Hosting: Vercel project `mslab` in Maria's team `ms-lab`, Hobby plan, region `fra1` (`docs/deploy.md`).

**Spec:** `docs/superpowers/specs/2026-10-08-phase2c-feedback-design.md`. Read all of it before starting; the section your task names is binding. The phase 3a plan (`docs/superpowers/plans/2026-10-05-phase3a-lessons-video.md`) explains the lesson code this phase builds on.

## Global Constraints

### Platform limits

- **Vercel Hobby only** (paid plans are ruled out). The limits that bind 2c:
  - **1M function invocations a month.** 2c adds no polling and no cron. The dashboard's `GET /api/konto` does a few more queries in the same call; opening a video lesson writes one row in the same call.
  - **4.5 MB request body**: every 2c body is a few hundred bytes.
  - **Cron jobs at most daily**: 2c adds none.
  - **CPU:** a password check is one scrypt hash (about 80 ms and 32 MiB), well inside `maxDuration = 30` of `/api/konto`.
- **Never call the real Bunny or the real Resend from a test.** The e2e run uses `tests/e2e/fake-bunny.ts`. Unit and DB tests stub `fetch` (`tests/fakes.ts` `stubFetch`). Sample addresses (`@example.test`) are never mailed. Development (`deps.dev`) mails nothing.

### Static shells and the account API

- **`/konto…` pages are static shells** (phase 2a rule, unchanged).
  - They read only `params`. No `cookies()`, `headers()`, `connection()` or `searchParams`.
  - Links carry state in the fragment: the login page's password step is `#parool` (Task 14). The middleware answers any query on a shell with a 303 into the fragment, `no-store`.
  - The home page is cached for every visitor too. It gets the welcome code the same way, from the fragment `#kood=…` (Task 9), never in its HTML.
  - Check: `next build` lists every `/[locale]/konto…` route as prerendered (● / ○), never ƒ.
- **Personal data comes only from `/api/konto/*` JSON** with `Cache-Control: private, no-store`.
  - Every endpoint behind a session starts with `requireClient(request, deps)` and answers through `clientResponse(session, …)`.
  - `tests/unit/account-guards.test.ts` lists every handler of the data section: extend it (Task 12). The password login sits with `login` and `code`, before that section: it has no session yet.
  - A non-GET request is same-origin only (`handleAccountApi`'s cross-site check, which also covers the new `DELETE`).
  - The route uses the app's one pool (`getDb()`); never `end()` it.
- **Ids read from text** go through `parseRowId` in `src/lib/row-id.ts`: digits only, no leading zero, 1 … 2 147 483 647.

### Simplicity and design

- **Simplicity rules** (phase 2a spec 2.1): each screen has one plain next-step sentence and at most one primary button. The "Pooleli" card's one button is "Jätka" ("Alusta" before the first lesson is done, as on the e-course page).
- **Design rules (Dim): simple in steps and words, not a new look.**
  - Use the public site's components, fonts (Jost/Manrope), colour tokens (`src/styles/tokens.css` only), button styles (`ui.btn`, `ui.btnOutline`, `ui.link`) and icons (`Icon`).
  - The admin uses its existing `ui.module.css`, `Choice`, `I18nInput`, `TextField`, `SingleImage`, `SaveBar`.
  - Touch targets ≥ 44 px. Mobile first (390 px; check 834/1440/2560). Respect `prefers-reduced-motion`. No horizontal page overflow.
  - Every new account CSS file goes into `tests/unit/colour-tokens.test.ts`'s list.
  - Reviewers check that no new visual style, colour or component appears where an existing one fits.

### Admin and text rules

- **Admin guards.** Admin pages call `requireAdmin()`. Server actions are `export const name = adminAction(…)` in `src/server/actions/admin*.ts`. 2c adds no admin action: the popup page keeps `saveCampaign`, the welcome code goes through `saveSettings`. `tests/unit/admin-guards.test.ts` stays as it is.
- **The admin is Estonian only**: its strings are in `src/i18n/dict/admin.ts`.
- **Dictionaries.** Every student or visitor string goes in `src/i18n/dict/et.ts` **and** `ru.ts`; the parity, placeholder and Cyrillic tests stay green.
  - Russian keeps the existing typography: in the account and mail texts, a no-break space (` `) after the one-letter words в, с, к, о, у.
  - The Russian texts are drafts. Task 1 lists them in `docs/launch-checklist.md` §9 for the native-speaker check.
- **The spec's texts are used verbatim**: "Edasi saab kerida kuni kohani, kuhu oled jõudnud.", "Pooleli", "Jätka", "Alusta", "{done} / {total} õppetundi tehtud", "Läbitud ✓", "Hüpikaken", "Lehel näidatakse", "Kampaania", "Uudiskiri", "Väljas", "Saatsime sulle kinnituslingi. Ava see oma postkastis.", "Tervituskood", "Tere tulemast MS LABi!", "Lisa kood registreerimisel lahtrisse „Sõnum“.", "Soovin MS LABi uudiseid ja pakkumisi", "Uudiskiri: jah / ootab kinnitust / ei", "Parool", "Määra parool", "Muuda parooli", "Eemalda parool", "Sisene parooliga", "Saada mulle hoopis kood", "E-post või parool ei sobi.", "Liiga palju katseid. Proovi 15 minuti pärast uuesti või sisene koodiga.", "Sinu MS LABi konto parool on muudetud.", "Saad soovi korral määrata parooli ja siseneda edaspidi e-posti ja parooliga. Kood töötab alati edasi.", "Parool on määratud (muudetud {date}).".
- **The repository is PUBLIC.**
  - No real e-mail address in any tracked file. `tests/unit/test-addresses.test.ts` scans `app/`, `tools/` and `docs/`, this plan included. Tests use `@example.test`, or `@example.com` where a mail must really be built and "sent" to a stubbed Resend.
  - The sending address of Maria's Resend is written whole only in `docs/deploy.md` and in the guard's allow-list, both in Task 15. This plan writes it in two parts: `info` + `@send.mslab.ee`.
  - No secrets anywhere: no key, token, webhook secret or database URL, in code, docs, tests or commit messages.

### Secrets, logging and the database

- **No PII and no secrets in logs.** Use `logFailure` / `logNote` from `src/server/log.ts`. Never log an e-mail, a password, a hash, a welcome code, a token or a signed URL.
- **Passwords** (Tasks 11–14) are never logged, never answered, never put in a URL, and never stored but as the scrypt hash. Every login failure gets the same answer and the same timing.
- **Migration `0005_phase2c.sql` is additive only.** The drop of `courses.modules`, planned as 0005 in the 3a plan, becomes **0006** and stays "code first, then the migration" (Task 1 updates the texts that say 0005).
- **No Railway writes, no deploys and no push before Task 16** (the controller).
  - Migration 0005 is generated in Task 1 and applied **locally only** (`npm run db:migrate` against `localhost`).
  - Tests and tools never write to Railway: the e2e run refuses non-local databases (`tests/e2e/local-db.ts`).
  - Merging into `main` deploys production. So phase 2c stays on `feat/phase2c-feedback`, local and unpushed, until Task 16.

### The accounts (moved on 08.10.2026)

| Part | Where |
|---|---|
| Site | **https://mslab.ee** (and `www.mslab.ee`). The old `mslab.diipsolutions.eu` only redirects there. |
| Hosting | Vercel team `ms-lab`, project `mslab` (Hobby, Root Directory `app`, `fra1`). |
| Deploy | A push to `main` of GitHub `mslabinformation-collab/mslab`. |
| Database | Maria's Railway project `mslab` (Postgres 18, EU West). |
| Files | Maria's R2 bucket `mslab-media` (`img/` public through `/media`, `lessons/` private). |
| Mail | Maria's Resend, domain `send.mslab.ee`, from `info` + `@send.mslab.ee`. |
| Video | Bunny Stream library 773592. |

All live checks of Task 16 run against https://mslab.ee.

### Commits and dependencies

- **Commits:** Conventional Commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The repo-local `git user.email` stays the GitHub noreply address.
- **No new dependency.** scrypt comes from `node:crypto`; Player.js stays the small listener in `player-js.ts`.

### Commands (from `app/`)

- Unit and DB tests: `npx vitest run <file>`; all: `npx vitest run`.
- Types and lint: `npx tsc --noEmit --incremental false`, then `npm run lint`.
- E2E against `next dev`: `npx playwright test <spec>`.
  - The production build: `E2E_PROD_BUILD=1 npx playwright test <spec>`.
  - The visual suite: `npm run visual` (screenshots in `visual-shots/local/<width>/`, git-ignored; look at the pages the task names).
- **Each task ends green on its own:** the whole `npx vitest run`, tsc, lint, and the e2e specs the task names.

---

## File Structure

```
app/
  drizzle/0005_phase2c.sql                       generated + the newsletter popup row (Task 1)
  src/db/schema.ts                               campaign.kind (+ indexes), clients.password_*, lesson_progress.clock_at, PopupKind, POPUP_ID (Task 1)
  src/db/seed-data.ts, seed-apply.ts             newsletter popup row, settings newsletter.welcomeCode (Task 1)
  src/domain/lessons.ts                          acceptProgress, openedClock (Task 2); seekStep, endedAt (Task 3)
  src/server/lesson-data.ts                      the progress clock: started on open, the cap on reports (Task 2)
  src/components/account/LessonPlayer.tsx (+css) the seek lock and its line under the player (Task 3)
  src/components/site/Header.module.css          the menu in Jost (Task 4)
  src/components/site/ui.module.css              ui.pageTitle (Task 4)
  src/components/site/BlogCarousel.tsx (+css)    the light news band (Task 5)
  src/components/site/Footer.tsx (+css), Newsletter.module.css   the half-height footer (Task 5)
  src/domain/account-cards.ts                    EcourseProgress, resumeSlug (Task 6)
  src/server/lesson-outline.ts                   ecourseProgress, progressActivity (Task 6)
  src/server/client-data.ts                      the cards' progress and `resume` (Task 6); passwordSetAt (Task 12)
  src/components/account/ProgressBar.tsx, ResumeCard.tsx (+css)   the e-course page's bar, the "Pooleli" card (Task 6)
  src/db/queries/public.ts                       HomeData.popup: the active popup row (Task 7)
  src/domain/campaign.ts                         newsletterPopupView, NEWSLETTER_SIGNED_KEY (Task 7); popupShown, popupFlags (Task 8)
  src/components/site/PopupDialog.tsx            the popups' timing and dialog, out of CampaignPopup (Task 7)
  src/components/site/NewsletterForm.tsx         the sign-up form, out of Newsletter (Task 7)
  src/components/site/NewsletterPopupCard.tsx, NewsletterPopup.tsx   the newsletter popup (Task 7)
  src/server/admin-site.ts, components/admin/CampaignEditor.tsx       "Hüpikaken" (Task 8); the welcome code in Seaded (Task 9)
  src/domain/welcome-code.ts, src/server/newsletter.ts                the welcome code and mail, the subscriber's state (Task 9)
  src/server/submit.ts, forms.ts                 confirmSubscriber's first time (Task 9); consent and "Sõnum" on the forms (Task 10)
  src/domain/password.ts, src/server/password.ts, client-password.ts  the password rules, scrypt, set/remove (Task 11)
  src/server/account-api.ts                      the welcome on "Saada mulle uudiskirja" (Task 9); the password endpoints (Task 12)
  src/components/account/PasswordSection.tsx     Minu andmed → "Parool" (Task 13)
  src/components/account/LoginForm.tsx           "Sisene parooliga" (Task 14)
docs/deploy.md, docs/launch-checklist.md         0006 and §9 (Task 1), the progress clock (Task 2), the accounts (Task 15)
app/.env.example, app/src/server/env.ts, tools/cache-smoke.mjs   mslab.ee and the new sending address (Task 15)
```

---

### Task 1: Migration 0005, the schema and the seed; the drop of `courses.modules` becomes 0006

Spec sections 3, 5, 7 and 8. Columns and one data row only: no code reads the new columns before Task 2. Every PGlite test database runs all migrations, so from now on every test database holds the newsletter popup row (id 2). Tests that read `campaign` without naming a row must name row 1.

**Files:**
- Modify: `app/src/db/schema.ts`
- Create: `app/drizzle/0005_phase2c.sql` (+ `app/drizzle/meta/0005_snapshot.json` and the `_journal.json` entry, from drizzle-kit)
- Modify: `app/src/db/seed-data.ts`, `app/src/db/seed-apply.ts`
- Modify (the 0006 texts): `app/drizzle/0003_lessons.sql` (comment line only), `docs/superpowers/plans/2026-10-05-phase3a-lessons-video.md`, `docs/launch-checklist.md`, `app/tests/db/migration-0003.test.ts` (comment)
- Test: `app/tests/db/migration-0005.test.ts` (new), `app/tests/db/schema.test.ts` (extend)
- Update: `app/tests/db/seed.test.ts`, `app/tests/db/ru-fill.test.ts`, `app/tests/db/admin-site.test.ts`, `app/tests/unit/campaign.test.ts`

**Interfaces:**
- Produces, from `src/db/schema.ts`:
  - `type PopupKind = "campaign" | "newsletter"`;
  - `const POPUP_ID: Record<PopupKind, number>` = `{ campaign: 1, newsletter: 2 }`;
  - the column `campaign.kind` (`text`, not null, default `"campaign"`), with the unique index `campaign_kind` and the partial unique index `campaign_one_active` (on `active` where `active`);
  - `clients.passwordHash: string | null` and `clients.passwordChangedAt: Date | null`;
  - `lessonProgress.clockAt: Date | null`.
- Produces in the database: the row `campaign` id 2, kind `newsletter`, inactive, with default ET/RU texts and the picture `/seed/gift-bag-serum.jpg`.
- Produces in the seed: `settings.newsletter.welcomeCode` = `""`.

- [ ] **Step 1: Write the failing schema test.** Append it to `tests/db/schema.test.ts` and add `campaign`, `clients` and `lessonProgress` to its `@/db/schema` import if missing (and `asc`, `eq` from `drizzle-orm`):

```ts
test("phase 2c columns: a progress clock, an optional password, one popup row per kind", async () => {
  const db = await makeTestDb();
  const [c] = await db.insert(clients).values({ email: "p2c@example.test" }).returning();
  expect([c.passwordHash, c.passwordChangedAt]).toEqual([null, null]);
  const [course] = await db.insert(courses).values({ slug: "p2c", type: "e_learning", level: "basic", title: { et: "P" }, summary: { et: "" }, body: { et: "" } }).returning();
  const [mod] = await db.insert(courseModules).values({ courseId: course.id, position: 1, title: { et: "M" } }).returning();
  const [lesson] = await db.insert(lessons).values({ moduleId: mod.id, position: 1, title: { et: "L" } }).returning();
  const [p] = await db.insert(lessonProgress).values({ clientId: c.id, lessonId: lesson.id }).returning();
  expect(p.clockAt).toBeNull();
  // the migration's newsletter row is there already; a campaign row takes the default kind
  await db.insert(campaign).values({ id: 1, active: true, kicker: { et: "" }, title: { et: "K" }, text: { et: "" }, ctaLabel: { et: "" }, ctaHref: "/koolitused", imageKey: "/seed/a.jpg" });
  expect((await db.select().from(campaign).orderBy(asc(campaign.id))).map((r) => [r.id, r.kind, r.active])).toEqual([[1, "campaign", true], [2, "newsletter", false]]);
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run `cd app && npx vitest run tests/db/schema.test.ts`. It fails: `passwordHash` and `clockAt` do not exist (TypeScript errors are reported by vitest as a failed transform, or the values come back `undefined`).

- [ ] **Step 3: Change the schema** (`src/db/schema.ts`).
  1. Above `export const campaign`, add:

```ts
/** Which home-page popup a `campaign` row is (phase 2c): the campaign offer, or the newsletter sign-up. One row of each. */
export type PopupKind = "campaign" | "newsletter";

/** The fixed row of each popup kind (the seed and the admin write these ids). */
export const POPUP_ID: Record<PopupKind, number> = { campaign: 1, newsletter: 2 };
```

  2. Replace the `campaign` table with:

```ts
/**
 * The home page's popups (prototype D's campaign; phase 2c adds the newsletter sign-up): one row per kind (POPUP_ID), and at most
 * one of them shown (`active`). The partial unique index makes the second active row a duplicate: every active row has the same
 * `active` value. The newsletter row uses kicker, title, text and imageKey; its code, ctaLabel and ctaHref stay empty.
 */
export const campaign = pgTable("campaign", {
  id: integer("id").primaryKey().default(1), active: boolean("active").notNull().default(true),
  kind: text("kind").$type<PopupKind>().notNull().default("campaign"),
  kicker: jsonb("kicker").$type<I18n>().notNull(), title: jsonb("title").$type<I18n>().notNull(), text: jsonb("text").$type<I18n>().notNull(),
  code: text("code").notNull().default(""), ctaLabel: jsonb("cta_label").$type<I18n>().notNull(), ctaHref: text("cta_href").notNull(),
  imageKey: text("image_key").notNull(),
}, (t) => [
  uniqueIndex("campaign_kind").on(t.kind),
  uniqueIndex("campaign_one_active").on(t.active).where(sql`${t.active}`),
]);
```

  3. In `clients`, after `locale`, add:

```ts
  /** The optional password (phase 2c): `scrypt$15$8$1$<salt>$<key>` (server/password.ts); null without one. The e-mail code always works. */
  passwordHash: text("password_hash"),
  /** When the password was last set or changed; null without a password. */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
```

  4. In `lessonProgress`, after `unlockedBy`, add:

```ts
  /**
   * The progress clock (phase 2c, domain/lessons.ts acceptProgress): the moment up to which her watching time has been used. Set when
   * a video lesson is opened and moved on by every report; null for rows written before phase 2c.
   */
  clockAt: timestamp("clock_at", { withTimezone: true }),
```

  5. Change the comment above `courses.modules` to say `Migration 0006 drops it after the 3a deploy (code first).`

- [ ] **Step 4: Generate the migration.** Run `cd app && npx drizzle-kit generate --name phase2c`. Open `drizzle/0005_phase2c.sql`.
  - It must contain these statements, in any order, and **nothing** that drops or rewrites:

```sql
ALTER TABLE "campaign" ADD COLUMN "kind" text DEFAULT 'campaign' NOT NULL;
ALTER TABLE "clients" ADD COLUMN "password_hash" text;
ALTER TABLE "clients" ADD COLUMN "password_changed_at" timestamp with time zone;
ALTER TABLE "lesson_progress" ADD COLUMN "clock_at" timestamp with time zone;
CREATE UNIQUE INDEX "campaign_kind" ON "campaign" USING btree ("kind");
CREATE UNIQUE INDEX "campaign_one_active" ON "campaign" USING btree ("active") WHERE "campaign"."active";
```

  - Then append the data step by hand (drizzle-kit does not generate data steps; the snapshot is unaffected):

```sql
--> statement-breakpoint
-- Data step (by hand): the newsletter popup's row, switched off, with default texts; the admin's "Hüpikaken" edits it (phase 2c).
INSERT INTO "campaign" ("id", "kind", "active", "kicker", "title", "text", "code", "cta_label", "cta_href", "image_key")
VALUES (2, 'newsletter', false,
  '{"et":"MS LABi kirjad","ru":"Письма MS LAB"}',
  '{"et":"Hea järgmine samm. Otse sinu postkasti.","ru":"Ваш следующий шаг. В вашем почтовом ящике."}',
  '{"et":"Uued koolitused, kasulikud mõtted ja tervitussoodustus sinu esimesele koolitusele.","ru":"Новые курсы, полезные идеи и приветственная скидка на первый курс."}',
  '', '{"et":""}', '', '/seed/gift-bag-serum.jpg')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: Write the migration test** `tests/db/migration-0005.test.ts`:

```ts
import { rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vitest";
import * as schema from "@/db/schema";
import { campaign, clients } from "@/db/schema";
import { migrationsThrough } from "./helpers";

// Migration 0005 (phase 2c) as the Railway database goes through it: 0000–0004 applied, Maria's campaign row live, a client, then
// 0005. It adds the newsletter popup's row (switched off) next to the campaign, one row per kind and at most one shown, and leaves
// the new columns empty. Additive: the live code (which reads row 1 and knows no new column) is unaffected.

test("0005 adds the newsletter popup row (off) next to the live campaign, one row per kind, at most one shown, and empty new columns", async () => {
  const db = drizzle(new PGlite(), { schema });
  const through = async (tag: string) => {
    const dir = migrationsThrough(tag);
    try {
      await migrate(db, { migrationsFolder: dir });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  await through("0004_video_shape");
  await db.execute(sql`
    insert into campaign (id, active, kicker, title, text, code, cta_label, cta_href, image_key)
    values (1, true, '{"et":"K"}', '{"et":"Kampaania"}', '{"et":""}', 'TALV15', '{"et":"Leia enda koolitus"}', '/koolitused', '/seed/lash-editorial.jpg')`);
  await db.execute(sql`insert into clients (email) values ('vana@example.test')`);

  await through("0005_phase2c");

  const rows = await db.select().from(campaign).orderBy(asc(campaign.id));
  expect(rows.map((r) => [r.id, r.kind, r.active, r.code])).toEqual([[1, "campaign", true, "TALV15"], [2, "newsletter", false, ""]]);
  expect(rows[1]).toMatchObject({
    kicker: { et: "MS LABi kirjad", ru: "Письма MS LAB" },
    title: { et: "Hea järgmine samm. Otse sinu postkasti.", ru: "Ваш следующий шаг. В вашем почтовом ящике." },
    ctaLabel: { et: "" },
    ctaHref: "",
    imageKey: "/seed/gift-bag-serum.jpg",
  });
  expect(rows[1].text.et).toBe("Uued koolitused, kasulikud mõtted ja tervitussoodustus sinu esimesele koolitusele.");
  // at most one shown: the newsletter row cannot be switched on while the campaign is
  await expect(db.update(campaign).set({ active: true }).where(eq(campaign.id, 2))).rejects.toThrow();
  await db.update(campaign).set({ active: false }).where(eq(campaign.id, 1));
  await db.update(campaign).set({ active: true }).where(eq(campaign.id, 2));
  // one row per kind
  await expect(db.insert(campaign).values({ id: 3, kind: "newsletter", active: false, kicker: { et: "" }, title: { et: "" }, text: { et: "" }, ctaLabel: { et: "" }, ctaHref: "", imageKey: "" })).rejects.toThrow();
  const [c] = await db.select().from(clients);
  expect([c.passwordHash, c.passwordChangedAt]).toEqual([null, null]);
});
```

- [ ] **Step 6: Run** `npx vitest run tests/db/schema.test.ts tests/db/migration-0005.test.ts` — expect PASS.

- [ ] **Step 7: The seed.**
  1. **`src/db/seed-data.ts`.** After `campaignSeed`, add:

```ts
/** The newsletter popup (phase 2c): switched off; the same row the migration adds, for a database the seed resets. */
export const newsletterPopupSeed: CampaignInput = {
  active: false,
  kicker: t("MS LABi kirjad", "Письма MS LAB"),
  title: t("Hea järgmine samm. Otse sinu postkasti.", "Ваш следующий шаг. В вашем почтовом ящике."),
  text: t("Uued koolitused, kasulikud mõtted ja tervitussoodustus sinu esimesele koolitusele.", "Новые курсы, полезные идеи и приветственная скидка на первый курс."),
  code: "",
  ctaLabel: t(""),
  ctaHref: "",
  imageKey: img("gift-bag-serum.jpg"),
};
```

     In `settingSeeds`, change `newsletter: { discountLabel: "10%" }` to `newsletter: { discountLabel: "10%", welcomeCode: "" }`.
  2. **`src/db/seed-apply.ts`.** Import `newsletterPopupSeed` and `POPUP_ID`. Replace the campaign line with:

```ts
  await db.insert(campaign).values({ ...campaignSeed, id: POPUP_ID.campaign, kind: "campaign" }).onConflictDoNothing({ target: campaign.id });
  await db.insert(campaign).values({ ...newsletterPopupSeed, id: POPUP_ID.newsletter, kind: "newsletter" }).onConflictDoNothing({ target: campaign.id });
```

- [ ] **Step 8: Update the tests that read `campaign` as one row, and the two that read the seeded newsletter setting whole.**
  - **`tests/db/seed.test.ts`:** in the counts object, `campaign: 1` becomes `campaign: 2`.
  - **`tests/db/ru-fill.test.ts`:** the two campaign lines of the setup name row 1:

```ts
    const [camp] = await db.select().from(campaign).where(eq(campaign.id, 1));
    await db.update(campaign).set({ kicker: etOnly(camp.kicker) as never, title: etOnly(camp.title) as never, text: etOnly(camp.text) as never, ctaLabel: etOnly(camp.ctaLabel) as never }).where(eq(campaign.id, 1));
```

  - **`tests/db/admin-site.test.ts`:** in the describe "campaign (D adminCamp + image upload, M3–M5)", its first test, change `const [row] = await db.select().from(campaign);` to `const [row] = await db.select().from(campaign).where(eq(campaign.id, 1));` (import `eq` if missing).
  - **`tests/unit/campaign.test.ts`:** the `row()` fixture builds a `Campaign`; add `kind: "campaign",` to its object.
  - **The seeded `newsletter` setting now holds `welcomeCode: ""`** (step 7), so the two exact expectations of it follow:
    - **`tests/db/seed.test.ts`**, "home data: five slides …": `expect(home.settings).toHaveProperty("newsletter", { discountLabel: "10%" });` becomes `expect(home.settings).toHaveProperty("newsletter", { discountLabel: "10%", welcomeCode: "" });`;
    - **`tests/db/admin-site.test.ts`**, "newsletter discount label and the legal pages": `expect((await getSettings(db)).newsletter).toEqual({ discountLabel: "15%" });` becomes `expect((await getSettings(db)).newsletter).toEqual({ discountLabel: "15%", welcomeCode: "" });` (the save keeps the stored keys it does not edit).

- [ ] **Step 9: Migration 0006 everywhere the 3a texts said 0005.**
  - **`docs/superpowers/plans/2026-10-05-phase3a-lessons-video.md`.** Every `0005` in it is the drop of `courses.modules` (ten places: lines 82, 192, 307, 461, 4500, 5204, 5221, 5227, 5300, 5309). Replace each `0005` with `0006`. In Task 12 step 11.5, change "the migrations count is 6" to "the migrations count is 7".
    - After the "**Step 11 (later …)**" line, add one line: `  - (Phase 2c took 0005 for its own additive migration; the drop is 0006.)`
  - **`app/drizzle/0003_lessons.sql`.** In the comment line of the data step, `(migration 0005 drops it after the 3a deploy)` becomes `(migration 0006 drops it after the 3a deploy)`. Change the comment only: drizzle's migrator compares the journal's time stamps, not the file's text, so an applied database is unaffected.
  - **`app/tests/db/migration-0003.test.ts`.** In the comment, `migration 0005 drops the column` becomes `migration 0006 drops the column`.
  - **`docs/launch-checklist.md` §8.** The item "Migration 0005 (drops `courses.modules`) …" becomes "Migration 0006 (drops `courses.modules`) …"; the rest of the line stays.

- [ ] **Step 10: The phase 2c items of the launch checklist.** Append to `docs/launch-checklist.md`:

```
## 9. Phase 2c (Maria's feedback of 06.10.2026)
- [ ] Native-speaker check of the Russian texts phase 2c added: `account.lesson.seekLocked`, the `account.dashboard` resume texts (`resumeTag` … `finished`), `newsletter.popupSent`, `newsletter.codeLine`, `mail.welcome.*`, `forms.newsletterConsent`, `account.passwordMail.*`, `account.details.password.*`, and the login page's password texts (`account.login.toPassword` … `passwordLocked`).
- [ ] Maria fills Seaded → "Tervituskood" (empty: no welcome mail and no code on the confirmed page) and applies the code on her invoice.
- [ ] Maria chooses in Hüpikaken what the home page shows (Kampaania / Uudiskiri / Väljas); the newsletter popup's picture is a sample one until she uploads her own.
- [ ] Bunny's speed menu must stop at 2×: the server's progress clock assumes it (`TOP_SPEED` in `app/src/domain/lessons.ts`). If Bunny ever offers more, raise the factor to the top speed.
- [ ] Accepted: a password is optional and per address; there is no "forgot password" link (the code login is the way back); admins have no passwords.
```

- [ ] **Step 11: Run everything.**
  - `npx vitest run` — all green.
  - `npx tsc --noEmit --incremental false`, then `npm run lint`.
  - Apply locally only: `npm run db:migrate` (the local URL). Then `psql postgres://postgres:postgres@localhost:5432/mslab -c "select id, kind, active from campaign order by id"` shows rows 1 (`campaign`) and 2 (`newsletter`, `f`).
  - The e2e campaign specs still pass: `npx playwright test campaign admin-site`.

- [ ] **Step 12: Commit.**

```bash
git add app/src/db/schema.ts app/drizzle app/src/db/seed-data.ts app/src/db/seed-apply.ts app/tests docs/superpowers/plans/2026-10-05-phase3a-lessons-video.md docs/launch-checklist.md
git commit -m "feat(db): migration 0005 — progress clock, popup kinds, optional password; drop of courses.modules becomes 0006

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: The server's progress clock

Spec section 3 (Server). The real rule against skipping: whatever the player says, the watched seconds may grow by at most twice the real time since the lesson was opened, plus 30 s. A report past that is clamped, never refused.

**One reading of the spec, made binding here.** The spec says `clock_at` is "set … on every accepted progress post". Read as "set to now", every report would bring a fresh 30 s. With the 12 reports a minute the API allows, that is 6 minutes of video per minute, and the spec's own claim — no completion faster than about half the length — would not hold. So `clock_at` is the moment up to which her watching time has been **used**:
- a raise of r seconds moves it r / 2 seconds on;
- opening the lesson sets it to now, unless it is already past now.

The formula stays `(now − clock_at) × 2 + 30`. All raises since the lesson was opened then add up to at most `2 × (time open) + 30`, however often she reports. An honest player at 1× or 2× is never clamped.

**Files:**
- Modify: `app/src/domain/lessons.ts`, `app/src/server/lesson-data.ts`, `app/src/server/admin-lessons.ts` (the delete guard: a clock-only row is no progress)
- Test: `app/tests/unit/lessons.test.ts` (extend), `app/tests/db/lesson-api.test.ts` (new tests and four updated ones), `app/tests/db/admin-lessons.test.ts` (extend)
- E2E: `app/tests/e2e/lessons.ts` (+ `backdateClock`), `app/tests/e2e/lesson-player.spec.ts`, `app/tests/e2e/account-lessons.spec.ts`
- Docs: `docs/launch-checklist.md` §8 (the "fake progress" item), `docs/deploy.md` §10 step 4 (the speed menu)

**Interfaces:**
- Consumes: `lessonProgress.clockAt` (Task 1).
- Produces, from `src/domain/lessons.ts`:
  - `const TOP_SPEED = 2`, `const PROGRESS_SLACK_SEC = 30`;
  - `acceptProgress(stored: { watchedSec: number; clockAt: Date | null }, reportedSec: number, now: Date): { watchedSec: number; clockAt: Date }`;
  - `openedClock(clockAt: Date | null, now: Date): Date`.
- Produces, from `tests/e2e/lessons.ts`: `backdateClock(clientId: number, lessonId: number, seconds?: number): Promise<void>` (default 3600).
- Changes, in `src/server/lesson-data.ts`:
  - `visibleLesson`'s row gains `clockAt: Date | null`;
  - `loadLesson` writes the clock for a ready video;
  - `saveProgress` clamps. Its answer type is unchanged.
- Changes, in `src/server/admin-lessons.ts`: `inUse` and the refusal of "Kustuta õppetund" count only rows with progress (watched, done or opened by an admin), not the clock-only row the lesson GET writes.

- [ ] **Step 1: Write the failing domain test.** Append it to `tests/unit/lessons.test.ts` and add `acceptProgress`, `openedClock`, `PROGRESS_SLACK_SEC` and `TOP_SPEED` to its `@/domain/lessons` import:

```ts
describe("the progress clock (phase 2c, spec 3)", () => {
  const T0 = new Date("2026-10-08T10:00:00Z");
  const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

  test("a report within twice the time since the clock plus 30 s is kept; the clock moves on by half the raise", () => {
    expect(acceptProgress({ watchedSec: 0, clockAt: T0 }, 40, at(20))).toEqual({ watchedSec: 40, clockAt: at(20) });
    expect(acceptProgress({ watchedSec: 100, clockAt: T0 }, 130, at(15))).toEqual({ watchedSec: 130, clockAt: at(15) });
  });

  test("a report past it is clamped, not refused: (now − clock) × 2 + 30", () => {
    expect(acceptProgress({ watchedSec: 0, clockAt: T0 }, 500, at(60))).toEqual({ watchedSec: 150, clockAt: at(75) });
  });

  test("a late or lower report raises nothing and leaves the clock", () => {
    expect(acceptProgress({ watchedSec: 80, clockAt: at(10) }, 50, at(40))).toEqual({ watchedSec: 80, clockAt: at(10) });
  });

  test("no clock yet (a row from before phase 2c, or none): it starts now and the report may raise the seconds by 30", () => {
    expect(acceptProgress({ watchedSec: 200, clockAt: null }, 900, at(0))).toEqual({ watchedSec: 230, clockAt: at(15) });
    expect(acceptProgress({ watchedSec: 0, clockAt: null }, 12.7, at(0))).toEqual({ watchedSec: 12, clockAt: at(6) });
  });

  test("reports however often add up to at most 2 × the time + 30 s (the factor is the top speed)", () => {
    let row: { watchedSec: number; clockAt: Date | null } = { watchedSec: 0, clockAt: T0 };
    for (let s = 1; s <= 60; s++) row = acceptProgress(row, 10_000, at(s)); // every second, asking for the end
    expect(TOP_SPEED).toBe(2);
    expect(row.watchedSec).toBe(60 * TOP_SPEED + PROGRESS_SLACK_SEC);
  });

  test("a clock used up beyond now allows less than 30 s, never a negative raise", () => {
    expect(acceptProgress({ watchedSec: 50, clockAt: at(40) }, 200, at(0))).toEqual({ watchedSec: 50, clockAt: at(40) });
    expect(acceptProgress({ watchedSec: 50, clockAt: at(10) }, 200, at(0))).toEqual({ watchedSec: 60, clockAt: at(15) });
  });

  test("opening a lesson starts the clock now, unless it is already past now (no new 30 s by opening it again)", () => {
    expect(openedClock(null, T0)).toEqual(T0);
    expect(openedClock(at(-600), T0)).toEqual(T0);
    expect(openedClock(at(12), T0)).toEqual(at(12));
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run tests/unit/lessons.test.ts`): "acceptProgress is not exported".

- [ ] **Step 3: Implement** in `src/domain/lessons.ts`, after `resumeAt`:

```ts
/** The top playback speed of Bunny's player (its speed menu stops at 2×): watching can move on at most this fast. */
export const TOP_SPEED = 2;
/** Seconds a report may run ahead of the clock: the 15 s report interval, the time the player takes to start, a slow network. */
export const PROGRESS_SLACK_SEC = 30;

/**
 * A progress report against the stored row (spec 3, the server's rule): the seconds kept and the new progress clock. `clockAt` is the
 * moment up to which her watching time has been used: the watched seconds may grow by at most (now − clockAt) × 2 + 30, and a raise
 * of r seconds moves the clock r / 2 seconds on. A report past that is clamped, never refused (a late or out-of-order report raises
 * nothing). Without a clock (a row from before phase 2c, or no row) the clock starts now: the report may raise the seconds by 30.
 * So all her raises since the lesson was opened add up to at most twice the time it has been open plus 30 s, however often she
 * reports: a lesson cannot be completed in less than about half its length, even if the player let her scrub ahead.
 */
export function acceptProgress(stored: { watchedSec: number; clockAt: Date | null }, reportedSec: number, now: Date): { watchedSec: number; clockAt: Date } {
  const clock = stored.clockAt ?? now;
  const allowed = Math.max(0, ((now.getTime() - clock.getTime()) / 1000) * TOP_SPEED + PROGRESS_SLACK_SEC);
  const watchedSec = Math.max(stored.watchedSec, Math.min(Math.floor(reportedSec), Math.floor(stored.watchedSec + allowed)));
  return { watchedSec, clockAt: new Date(clock.getTime() + ((watchedSec - stored.watchedSec) / TOP_SPEED) * 1000) };
}

/** The progress clock when a video lesson is opened: now, unless her time is used up beyond now (then it stays: no new 30 s by reopening). */
export function openedClock(clockAt: Date | null, now: Date): Date {
  return clockAt !== null && clockAt > now ? clockAt : now;
}
```

- [ ] **Step 4: Run** the unit test — expect PASS.

- [ ] **Step 5: Write the failing DB tests.** In `tests/db/lesson-api.test.ts`:
  1. After `lessonPath`, add the helper:

```ts
/** Her progress clock on `lessonId` set `sec` seconds back, as if she had opened it then: reports up to 2 × sec + 30 s are kept. */
async function openedAgo(w: Awaited<ReturnType<typeof world>>, lessonId: number, sec = 3600) {
  const clockAt = new Date(NOW.getTime() - sec * 1000);
  await db.insert(lessonProgress).values({ clientId: w.client.id, lessonId, clockAt }).onConflictDoUpdate({ target: [lessonProgress.clientId, lessonProgress.lessonId], set: { clockAt } });
}
```

  2. Three existing tests post seconds at `NOW` with no lesson opened before: give them an hour of clock. Add `await openedAgo(w, w.l1.id);` as the line after `const w = await world();` in:
     - "progress is kept at its highest; at 90 % the lesson is done …";
     - "progress refuses: no number (400), past the length + 5 s (400), …";
     - "done_at is the moment the lesson was done: …".
  3. One existing test counts the progress rows after opening a lesson. "a lesson or file of another course is 404 under this course's slug, …" opens B's video lesson under its own slug (200), which now writes her clock row there. Its last line becomes:

```ts
  // the refused calls wrote nothing; the lesson opened under its own slug started its clock (a row with 0 s)
  expect((await db.select().from(lessonProgress)).map((r) => [r.lessonId, r.watchedSec, r.doneAt])).toEqual([[b.b1.id, 0, null]]);
```

  4. Append the new tests:

```ts
// ---- phase 2c: the progress clock (spec 3, domain/lessons.ts acceptProgress) ----

test("opening a lesson with a ready video starts its progress clock (a row with 0 s); reopened later it moves on, the seconds stay; a text lesson writes none", async () => {
  const w = await world();
  await call(deps(), w.cookie, lessonPath(w.l1.id));
  const [row] = await db.select().from(lessonProgress);
  expect([row.lessonId, row.watchedSec, row.clockAt, row.doneAt]).toEqual([w.l1.id, 0, NOW, null]);
  await db.update(lessonProgress).set({ watchedSec: 40 });
  const later = new Date(NOW.getTime() + 3600_000);
  await call(deps({ now: later }), w.cookie, lessonPath(w.l1.id));
  expect((await db.select().from(lessonProgress))[0]).toMatchObject({ watchedSec: 40, clockAt: later });
  await db.update(lessonProgress).set({ doneAt: NOW });
  await call(deps(), w.cookie, lessonPath(w.l2.id)); // the text lesson, open now
  expect(await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, w.l2.id))).toEqual([]);
});

test("a report that runs ahead is clamped to twice the time since the lesson was opened plus 30 s, not refused; the 90 % rule counts what was kept", async () => {
  const w = await world(); // lesson 1: 100 s
  await call(deps(), w.cookie, lessonPath(w.l1.id));
  const at = (sec: number) => deps({ now: new Date(NOW.getTime() + sec * 1000) });
  expect(await (await call(at(10), w.cookie, lessonPath(w.l1.id, "/progress"), { watchedSec: 95 })).json()).toEqual({ ok: true, done: false, next: w.l2.id });
  expect((await db.select().from(lessonProgress))[0].watchedSec).toBe(50); // 10 × 2 + 30
  expect(await (await call(at(30), w.cookie, lessonPath(w.l1.id, "/progress"), { watchedSec: 95 })).json()).toEqual({ ok: true, done: true, next: w.l2.id });
  expect((await db.select().from(lessonProgress))[0].watchedSec).toBe(90); // + (30 − 25) × 2 + 30
});

test("reports as often as the limit allows cannot beat the clock: a minute of them keeps at most 2 × 60 + 30 s", async () => {
  const w = await world();
  await db.update(lessons).set({ durationSec: 3600 }).where(eq(lessons.id, w.l1.id));
  await call(deps(), w.cookie, lessonPath(w.l1.id));
  for (let s = 5; s <= 60; s += 5) await call(deps({ now: new Date(NOW.getTime() + s * 1000) }), w.cookie, lessonPath(w.l1.id, "/progress"), { watchedSec: 3600 });
  expect((await db.select().from(lessonProgress))[0].watchedSec).toBe(150);
});

test("a row from before phase 2c (no clock): the first report raises the seconds by at most 30 and starts the clock", async () => {
  const w = await world();
  await db.update(lessons).set({ durationSec: 600 }).where(eq(lessons.id, w.l1.id));
  await db.insert(lessonProgress).values({ clientId: w.client.id, lessonId: w.l1.id, watchedSec: 200 });
  await call(deps(), w.cookie, lessonPath(w.l1.id, "/progress"), { watchedSec: 400 });
  expect((await db.select().from(lessonProgress))[0]).toMatchObject({ watchedSec: 230, clockAt: new Date(NOW.getTime() + 15_000) });
});

test("opening the lesson again gives no new 30 s while her time is used up beyond now", async () => {
  const w = await world();
  await db.update(lessons).set({ durationSec: 600 }).where(eq(lessons.id, w.l1.id));
  await call(deps(), w.cookie, lessonPath(w.l1.id)); // the clock: NOW
  await call(deps(), w.cookie, lessonPath(w.l1.id, "/progress"), { watchedSec: 30 }); // 30 kept; the clock: NOW + 15 s
  await call(deps(), w.cookie, lessonPath(w.l1.id)); // opened again at NOW: the clock stays at NOW + 15 s
  await call(deps(), w.cookie, lessonPath(w.l1.id, "/progress"), { watchedSec: 60 }); // allowed: (0 − 15) × 2 + 30 = 0
  expect((await db.select().from(lessonProgress))[0]).toMatchObject({ watchedSec: 30, clockAt: new Date(NOW.getTime() + 15_000) });
});
```

  5. **`tests/db/admin-lessons.test.ts`.** "Kustuta õppetund" is refused once a student has progress on the lesson (3a spec 7: the counts stay honest). The row the lesson GET now writes holds only her clock: it must not turn a lesson she merely opened into one that can only be hidden. At the end of "hide and show; delete only without progress, …", add:

```ts
    // a row with only the progress clock (phase 2c: she opened the lesson and watched nothing) is no progress: the lesson can still go
    await db.insert(lessonProgress).values({ clientId: c.id, lessonId: w.l1, clockAt: new Date() });
    expect((await listCourseLessons(db, courseId))[0].lessons[0].inUse).toBe(false);
    expect((await deleteLessonForm(db, form({ id: w.l1 }))).result).toEqual({ ok: true, id: w.l1, deleted: true });
    expect(await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, w.l1))).toEqual([]); // its row went with it
```

- [ ] **Step 6: Run it — expect FAIL** (`npx vitest run tests/db/lesson-api.test.ts tests/db/admin-lessons.test.ts`): no row after the lesson GET, nothing is clamped, and the clock-only row blocks the delete.

- [ ] **Step 7: Implement** in `src/server/lesson-data.ts`:
  1. Import `acceptProgress` and `openedClock` from `@/domain/lessons`.
  2. In `visibleLesson`'s select, after `done`, add `clockAt: lessonProgress.clockAt,`.
  3. Add, after `videoOf`:

```ts
/** Opening a video lesson whose video plays starts its progress clock (domain/lessons.ts openedClock); the row is made when there is none, its seconds stay. */
async function startClock(db: Db, clientId: number, row: LessonRow, now: Date): Promise<void> {
  const clockAt = openedClock(row.clockAt, now);
  await db
    .insert(lessonProgress)
    .values({ clientId, lessonId: row.id, clockAt, updatedAt: now })
    .onConflictDoUpdate({ target: [lessonProgress.clientId, lessonProgress.lessonId], set: { clockAt, updatedAt: now } });
}
```

  4. In `loadLesson`, compute the video first and start the clock for a ready one:

```ts
  if (!client) return { kind: "notFound" };
  const video = await videoOf(row, bunny, now);
  if (video?.state === "ready") await startClock(db, clientId, row, now);
  return {
    kind: "lesson",
    view: {
      course: { slug: access.course.slug, title: access.course.title },
      module: { title: row.moduleTitle },
      lesson: { id: row.id, title: row.title, body: row.body, done: row.done, textOnly: row.kind === "text" },
      video,
      files,
      next: nextLessonAfter(outline.lessons, lessonId),
      watermark: client.email,
    },
  };
```

  5. Replace `saveProgress`'s write and its doc comment:

```ts
/**
 * POST progress: the reported second clamped by the progress clock (domain/lessons.ts acceptProgress: at most twice the time since the
 * lesson was opened plus 30 s, a report past it is kept at that), kept at its highest (one upsert), done once what is kept reaches 90 %
 * of the length. A video lesson with a playable video only ("watch"): a text lesson, and a video lesson still waiting for its video,
 * are "video" (409). Two reports at the same moment read the same row; the later write wins the clock, which can let one race through
 * at most one more allowance: accepted.
 */
export async function saveProgress(db: Db, clientId: number, slug: string, lessonId: number, watchedSec: number, now: Date): Promise<ProgressResult> {
  const opened = await openLesson(db, clientId, slug, lessonId, now);
  if (opened.kind !== "open") return opened;
  const { row, outline } = opened;
  if (completion(row) !== "watch" || row.durationSec === null) return { kind: "video" };
  if (watchedSec > row.durationSec + 5) return { kind: "range" };
  const kept = acceptProgress({ watchedSec: row.watchedSec, clockAt: row.clockAt }, watchedSec, now);
  const [saved] = await db
    .insert(lessonProgress)
    .values({ clientId, lessonId, watchedSec: kept.watchedSec, clockAt: kept.clockAt, doneAt: isWatched(kept.watchedSec, row.durationSec) ? now : null, updatedAt: now })
    .onConflictDoUpdate({
      target: [lessonProgress.clientId, lessonProgress.lessonId],
      set: {
        watchedSec: sql`greatest(${lessonProgress.watchedSec}, excluded.watched_sec)`,
        clockAt: kept.clockAt,
        doneAt: sql`coalesce(${lessonProgress.doneAt}, excluded.done_at)`,
        updatedAt: now,
      },
    })
    .returning(); // (returning(fields) has no common overload on the Db union: the whole row)
  return { kind: "saved", done: saved.doneAt !== null, next: nextLessonAfter(outline.lessons, lessonId) };
}
```

  6. In the file's top comment, add one sentence: "Opening a video lesson starts its progress clock, and a report can raise the watched seconds only as far as the clock allows (spec 2c section 3)."
  7. **The lesson's delete guard keeps its meaning** (`src/server/admin-lessons.ts`). A row that holds only the clock (0 s, not done, not opened by an admin) is no progress. Add `and` to the file's `drizzle-orm` import, and after the imports:

```ts
/** A progress row that is progress: watched, done, or opened by an admin ("Ava järgmine õppetund"). A row with only the progress clock (phase 2c: the lesson GET writes it) is none. */
const HAS_PROGRESS = sql`(${lessonProgress.watchedSec} > 0 or ${lessonProgress.doneAt} is not null or ${lessonProgress.unlockedBy} is not null)`;
```

     - In `listCourseLessons`, `inUse` becomes `` sql<boolean>`exists (select 1 from ${lessonProgress} where ${lessonProgress.lessonId} = ${lessons.id} and ${HAS_PROGRESS})` ``.
     - In `deleteLessonForm`, the count's `.where(eq(lessonProgress.lessonId, id))` becomes `.where(and(eq(lessonProgress.lessonId, id), HAS_PROGRESS))`, and its doc comment says "once any student has progress on it (watched, done or opened by an admin; a row with only the progress clock is none)".

- [ ] **Step 8: Run** `npx vitest run tests/db/lesson-api.test.ts tests/db/admin-lessons.test.ts tests/unit/lessons.test.ts` — expect PASS; then the whole `npx vitest run`.

- [ ] **Step 9: The e2e tests that play a whole video in a few seconds.** The fake player reaches the end of 125 s in about a second: the clock now keeps only about 30 s of it. These tests set her clock back an hour, as if she had been watching for that long.
  1. **`tests/e2e/lessons.ts`.** Append:

```ts
/**
 * Her progress clock on a lesson set `seconds` back (phase 2c: the server keeps reports of up to 2 × the time since the lesson was
 * opened + 30 s), as if she had opened it that long ago: for tests whose fake player plays a whole video in a second. The lesson must
 * have been opened (the lesson GET writes the row).
 */
export async function backdateClock(clientId: number, lessonId: number, seconds = 3600): Promise<void> {
  await localDb((sql) => sql`update lesson_progress set clock_at = now() - make_interval(secs => ${seconds}) where client_id = ${clientId} and lesson_id = ${lessonId}`);
}
```

  2. **`tests/e2e/lesson-player.spec.ts`.**
     - Import `backdateClock` from `./lessons`.
     - In "the player: Bunny's frame (the fake) … played to the end: done", add `await backdateClock(lesson.clientId, lesson.lessonId);` right before the click on "Mängi lõpuni".
     - `student()` now opens the lesson (`readyLesson` is the lesson GET), which writes her row with 0 s. So in "only the player's frame is heard … leaving the page …" and in "no word from Bunny …", `expect(await storedProgress(lesson.clientId, lesson.lessonId)).toBeNull();` becomes `expect(await storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 0, done: false });`.
  3. **`tests/e2e/account-lessons.spec.ts`.** Import `backdateClock` from `./lessons`. In the test that plays lesson 1 to "Õppetund tehtud ✓", add `await backdateClock(c.clientId, c.lessons.video);` right before its click on "Mängi lõpuni" (after `playerListens`).

- [ ] **Step 10: Docs.**
  - **`docs/launch-checklist.md` §8.** Replace the item "Accepted limit: a student can fake her progress. …" with:

```
- [ ] Accepted limit, narrowed in phase 2c: the player takes back a forward jump past what she has watched, and the server keeps at most twice the real time since the lesson was opened plus 30 s, so a video lesson cannot be completed in less than about half its length. A script can still report steadily at 2× without watching: "done" means "the time was spent with the lesson open", not "watched".
```

  - **`docs/deploy.md` §10, step 4 (Player controls).** Append the sentence: "Playback speeds: at most 2× (the speed menu's list): the server's progress clock assumes 2× is the top speed (phase 2c, `TOP_SPEED` in `app/src/domain/lessons.ts`)."

- [ ] **Step 11: Run** `npx tsc --noEmit --incremental false`, `npm run lint`, then `npx playwright test lesson-player account-lessons` — all green.

- [ ] **Step 12: Commit.**

```bash
git add app/src/domain/lessons.ts app/src/server/lesson-data.ts app/src/server/admin-lessons.ts app/tests/unit/lessons.test.ts app/tests/db/lesson-api.test.ts app/tests/db/admin-lessons.test.ts app/tests/e2e/lessons.ts app/tests/e2e/lesson-player.spec.ts app/tests/e2e/account-lessons.spec.ts docs/launch-checklist.md docs/deploy.md
git commit -m "feat(lessons): the progress clock — watched seconds grow at most twice the real time plus 30 s

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The player's seek lock

Spec section 3 (Player). A `timeupdate` more than 3 s past the furthest point watched is a jump forward. The page sends Player.js `setCurrentTime(furthest)` to the embed and does not count it. Rewinding and speed stay free. `ended` counts as the end only within 5 s of it. A short polite line under the player says why, for 6 s. Resume (`t=` in the signed address) is unchanged. A lesson already done is not locked, so she can skip through a lesson she has watched.

**Files:**
- Modify: `app/src/domain/lessons.ts`, `app/src/components/account/LessonPlayer.tsx`, `app/src/components/account/LessonPlayer.module.css`
- Modify: `app/src/i18n/dict/et.ts`, `app/src/i18n/dict/ru.ts` (`account.lesson.seekLocked`)
- Test: `app/tests/unit/lessons.test.ts` (extend), `app/tests/unit/lesson-player.test.ts` (the message helper + new tests)
- E2E: `app/tests/e2e/fake-bunny.ts` (2 s steps, `__seeks`), `app/tests/e2e/lesson-player.spec.ts` (`playFrom`, a seek-lock test)

**Interfaces:**
- Produces, from `src/domain/lessons.ts`:
  - `const SEEK_TOLERANCE_SEC = 3`, `const END_TOLERANCE_SEC = 5`;
  - `type SeekStep = { furthest: number; back: number | null }`;
  - `seekStep(furthest: number, seconds: number, durationSec: number): SeekStep`;
  - `endedAt(furthest: number, durationSec: number): number`.
- Produces, from `LessonPlayer.tsx`: `export const SEEK_NOTE_MS = 6000`, and the element `[data-seek-note]` (role `status`, in the page from the start).
- Produces, in the fake player: `window.__seeks: number[]` (each `setCurrentTime` value).

- [ ] **Step 1: Write the failing domain test.** Append it to `tests/unit/lessons.test.ts`; import `endedAt` and `seekStep`:

```ts
describe("the seek lock (phase 2c, spec 3)", () => {
  test("within 3 s of the furthest point a timeupdate counts (capped at the length); further on it is a jump: back to the furthest point", () => {
    expect(seekStep(10, 12.5, 100)).toEqual({ furthest: 12.5, back: null });
    expect(seekStep(10, 13, 100)).toEqual({ furthest: 13, back: null });
    expect(seekStep(10, 13.01, 100)).toEqual({ furthest: 10, back: 10 });
    expect(seekStep(98, 100.5, 100)).toEqual({ furthest: 100, back: null });
  });

  test("rewinding is free: an earlier second changes nothing", () => {
    expect(seekStep(40, 5, 100)).toEqual({ furthest: 40, back: null });
  });

  test("ended is the end only within 5 s of it", () => {
    expect(endedAt(95, 100)).toBe(100);
    expect(endedAt(100, 100)).toBe(100);
    expect(endedAt(94.9, 100)).toBe(94.9);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**: "seekStep is not exported".

- [ ] **Step 3: Implement** in `src/domain/lessons.ts`, after `openedClock`:

```ts
/** How far past the furthest point watched a timeupdate may be and still count (Bunny reports a few times a second; 2× moves about 1 s). */
export const SEEK_TOLERANCE_SEC = 3;
/** "ended" counts as the end of the video only this close to it. */
export const END_TOLERANCE_SEC = 5;

/** One timeupdate's effect: the new furthest point, and where to send the player back to (null: nowhere). */
export type SeekStep = { furthest: number; back: number | null };

/**
 * The seek lock (spec 3, the player's side): a timeupdate at most 3 s past `furthest` counts (furthest grows, capped at the length); one
 * further on is a jump forward, so the player goes back to `furthest` (Player.js setCurrentTime) and furthest stays. An earlier second
 * (a rewind) changes nothing. The server's progress clock (acceptProgress) is the real rule; this keeps an honest player honest.
 */
export function seekStep(furthest: number, seconds: number, durationSec: number): SeekStep {
  if (seconds > furthest + SEEK_TOLERANCE_SEC) return { furthest, back: furthest };
  return { furthest: Math.max(furthest, Math.min(seconds, durationSec)), back: null };
}

/** The furthest point after "ended": the whole length when it was already within 5 s of the end, else unchanged. */
export function endedAt(furthest: number, durationSec: number): number {
  return furthest >= durationSec - END_TOLERANCE_SEC ? durationSec : furthest;
}
```

- [ ] **Step 4: Run** it — expect PASS.

- [ ] **Step 5: The dictionaries.** In `account.lesson`, after `video`:
  - `et.ts`: `seekLocked: "Edasi saab kerida kuni kohani, kuhu oled jõudnud.",` and extend the section's comment with "`seekLocked`: the line under the player after a jump forward was taken back (phase 2c)".
  - `ru.ts`: `seekLocked: "Перемотать вперёд можно только до места, до которого вы досмотрели.",`

- [ ] **Step 6: Change the unit tests' message helper** (`tests/unit/lesson-player.test.ts`).
  - The tests jump the player forward in one message (`{ seconds: 12.4 }` right after "ready"), which the lock would now take back.
  - Replace `fromPlayer` with a version that plays there the way a playing video does, one second at a time. Add a raw `send` for the lock's own tests.
  1. Replace the `fromPlayer` constant with:

```ts
/** One Player.js message from the player's iframe as it is (a JSON string), from `origin` and the window `source`. */
const send = (event: string, value?: unknown, origin = ORIGIN, source: unknown = playerWindow) =>
  act(async () => {
    window.dispatchEvent(new MessageEvent("message", { origin, source: source as Window, data: JSON.stringify({ context: "player.js", version: "0.0.11", event, value }) }));
  });
/** Where the player's own timeupdates have got to since its last "ready", and the length they gave. */
let at = 0;
let length = 100;
/**
 * A message from the player as a playing video sends it: a timeupdate further on than the last comes after one for every second on
 * the way (Bunny's player reports a few times a second; the page takes back a jump of more than 3 s), and "ended" after the video
 * has played to its end. Lower seconds (a rewind) and every other message go as they are. `send` sends one message as it is.
 */
async function fromPlayer(event: string, value?: unknown, origin = ORIGIN, source: unknown = playerWindow): Promise<void> {
  if (event === "ready") at = 0;
  const v = value as { seconds?: unknown; duration?: unknown } | null | undefined;
  if (event === "timeupdate" && typeof v?.duration === "number") length = v.duration;
  const to = event === "timeupdate" ? (typeof v?.seconds === "number" ? v.seconds : null) : event === "ended" ? length : null;
  if (to !== null) {
    for (let s = Math.floor(at) + 1; s < to; s++) await send("timeupdate", { seconds: s, duration: length }, origin, source);
    at = Math.max(at, to);
  }
  await send(event, value, origin, source);
}
```

  2. In `beforeEach`, before the render, add `at = 0;` and `length = 100;`.
  3. Append the new tests:

```ts
// ---- phase 2c: the seek lock (spec 3) ----

test("seek lock: a timeupdate more than 3 s past the furthest point is taken back (setCurrentTime to it) and not counted; within 3 s it counts", async () => {
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 10, duration: 100 });
  posted.length = 0;
  await send("timeupdate", { seconds: 13, duration: 100 }); // 3 s on: fine
  expect(posted).toEqual([]);
  await send("timeupdate", { seconds: 60, duration: 100 }); // the slider dragged far ahead
  expect(posted).toEqual([{ context: "player.js", version: "0.0.11", method: "setCurrentTime", value: 13 }]);
  await fromPlayer("pause");
  await tick(0);
  expect(progressPosts()).toEqual([{ watchedSec: 13 }]);
});

test("seek lock: the line under the player says how far one may skip, for 6 s; rewinding is free and says nothing", async () => {
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 20, duration: 100 });
  const note = container.querySelector("[data-seek-note]")!;
  expect([note.getAttribute("role"), note.textContent]).toEqual(["status", ""]);
  await send("timeupdate", { seconds: 5, duration: 100 }); // back: free
  expect(note.textContent).toBe("");
  await send("timeupdate", { seconds: 50, duration: 100 });
  expect(note.textContent).toBe("Edasi saab kerida kuni kohani, kuhu oled jõudnud.");
  await tick(5_999);
  expect(note.textContent).not.toBe("");
  await tick(1);
  expect(note.textContent).toBe("");
});

test("ended counts as the end only within 5 s of it", async () => {
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 50, duration: 100 });
  await send("ended");
  await tick(0);
  expect(progressPosts()).toEqual([{ watchedSec: 50 }]); // not 100
  await fromPlayer("timeupdate", { seconds: 95, duration: 100 });
  await send("ended");
  await tick(0);
  expect(progressPosts().at(-1)).toEqual({ watchedSec: 100 });
});

test("a lesson already done is not locked: skipping ahead is free (she has watched it)", async () => {
  await remount({ done: true });
  await fromPlayer("ready", {});
  posted.length = 0;
  await send("timeupdate", { seconds: 80, duration: 100 });
  expect(posted).toEqual([]);
  expect(container.querySelector("[data-seek-note]")?.textContent).toBe("");
});

test("resumed at the saved second: the lock counts from there", async () => {
  await remount({ video: { ...VIDEO, resumeAt: 42 } });
  await fromPlayer("ready", {});
  posted.length = 0;
  await send("timeupdate", { seconds: 44, duration: 100 });
  await send("timeupdate", { seconds: 70, duration: 100 });
  expect(posted.map((m) => [m.method, m.value])).toEqual([["setCurrentTime", 44]]);
});

test("Russian: the seek line in Russian", async () => {
  await act(async () => root.render(createElement(LessonPlayer, { ...props(), key: "ru", t: lessonTexts(getDict("ru")) })));
  await fromPlayer("ready", {});
  await fromPlayer("timeupdate", { seconds: 10, duration: 100 });
  await send("timeupdate", { seconds: 70, duration: 100 });
  expect(container.querySelector("[data-seek-note]")?.textContent).toBe("Перемотать вперёд можно только до места, до которого вы досмотрели.");
});
```

- [ ] **Step 7: Run it — expect FAIL**: no `[data-seek-note]`, no `setCurrentTime`; the existing tests pass with the walking helper.

- [ ] **Step 8: Implement** in `src/components/account/LessonPlayer.tsx`.
  1. Imports: `import { endedAt, seekStep, videoAspect, type VideoShape } from "@/domain/lessons";`.
  2. After `READY_TIMEOUT_MS`, add:

```ts
/** The line under the player after a jump forward was taken back stays this long (spec 3). */
export const SEEK_NOTE_MS = 6000;
```

  3. In `Player`, next to the other state: `const [seekNote, setSeekNote] = useState(false);`.
  4. In the listener effect:
     - Before `onMessage`, add:

```ts
    let noteTimer: number | undefined;
    /** "Edasi saab kerida kuni kohani, kuhu oled jõudnud." under the player, for 6 s (a second jump starts the 6 s again). */
    const showSeekNote = () => {
      setSeekNote(true);
      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(() => setSeekNote(false), SEEK_NOTE_MS);
    };
```

     - Replace the `timeupdate` and `ended` branches with:

```ts
      } else if (message.event === "timeupdate") {
        const seconds = secondsOf(message.value);
        if (seconds === null) return;
        // a lesson that is done (or refused for good) reports nothing more: skipping ahead is free
        if (finished.current) return;
        const step = seekStep(furthest.current, seconds, video.durationSec);
        furthest.current = step.furthest;
        if (step.back !== null) {
          frame.current.contentWindow?.postMessage(playerCommand("setCurrentTime", step.back), origin);
          showSeekNote();
        }
      } else if (message.event === "pause") {
        void report();
      } else if (message.event === "ended") {
        furthest.current = endedAt(furthest.current, video.durationSec);
        void report();
      }
```

     - In the effect's cleanup, add `window.clearTimeout(noteTimer);`.
  5. In the markup, between the `stage` div and the bar, add:

```tsx
      {/* in the page from the start, empty: the sentence is announced when a jump forward was taken back */}
      <p className={styles.seekNote} role="status" data-seek-note="">
        {seekNote ? t.seekLocked : ""}
      </p>
```

  6. In the component's doc comment, after "Progress: …", add: "A timeupdate more than 3 s past the furthest point is a jump forward: the player is sent back there (Player.js setCurrentTime) and a line under it says how far one may skip, for 6 s; rewinding and speed stay free, and a lesson already done is not locked (domain/lessons.ts seekStep)."
- [ ] **Step 9: CSS** (`LessonPlayer.module.css`), after `.bar`:

```css
/* the line under the picture after a jump forward was taken back: a polite live region, empty (no height) otherwise */
.seekNote {
  margin: 0;
  color: var(--ink-soft);
  font: 400 14px/1.5 var(--font-body);
}

.seekNote:not(:empty) {
  padding-top: 8px;
}

.player:fullscreen .seekNote,
.player[data-expanded] .seekNote {
  padding-inline: 16px;
  color: var(--paper);
}
```

- [ ] **Step 10: Run** `npx vitest run tests/unit/lesson-player.test.ts tests/unit/lessons.test.ts tests/unit/i18n.test.ts` — expect PASS.

- [ ] **Step 11: The fake player plays the way the lock expects** (`tests/e2e/fake-bunny.ts`, inside `player(start)`).
  - Today it moves 13 s a step: every step would be taken back.
  - It now moves 2 s a step every 20 ms, so "Mängi lõpuni" still takes about a second and a half.
  - Each `setCurrentTime` it gets is noted in `window.__seeks`.
  1. Replace the first script line `const duration = ${LENGTH}; let current = ${start}; const listeners = {};` with:

```js
const duration = ${LENGTH}; let current = ${start}; const listeners = {}; const seeks = []; window.__seeks = seeks;
```

  2. Replace `if (m.method === "setCurrentTime") current = Number(m.value);` with:

```js
  if (m.method === "setCurrentTime") { current = Number(m.value); seeks.push(current); document.querySelector("[data-fake-time]").textContent = String(current); }
```

  3. In the play loop, replace `current = Math.min(duration, current + Math.ceil(duration / 10));` with `current = Math.min(duration, current + 2);` and `setTimeout(r, 40)` with `setTimeout(r, 20)`.
  4. In the file's top comment, change the player line to: "'Mängi lõpuni' sends timeupdate up to the length in 2 s steps (the page's seek lock takes back a jump of more than 3 s), then pause, ended; setCurrentTime moves the fake's time and is noted in `window.__seeks`".
- [ ] **Step 12: The e2e player tests** (`tests/e2e/lesson-player.spec.ts`).
  1. After `postFromPlayer`, add:

```ts
/** The fake player playing from `from` to `to`: Player.js timeupdates a second apart, as a playing video sends them (the seek lock takes back a jump of more than 3 s). */
async function playFrom(frame: Frame, from: number, to: number, duration = 125) {
  for (let s = Math.floor(from) + 1; s < to; s++) await postFromPlayer(frame, "timeupdate", { seconds: s, duration });
  await postFromPlayer(frame, "timeupdate", { seconds: to, duration });
}
```

  2. In "only the player's frame is heard … leaving the page …", replace `await postFromPlayer(fake, "timeupdate", { seconds: 30.6, duration: 125 });` with `await playFrom(fake, 0, 30.6);`.
  3. In "resume: the frame starts at the saved second (t=40) …", replace `await postFromPlayer(fake, "timeupdate", { seconds: 45.2, duration: 125 });` with `await playFrom(fake, 40.8, 45.2);`.
  4. Append:

```ts
test("the seek lock: a jump forward is taken back to the furthest point watched (setCurrentTime), with the line under the player; rewinding is free", async ({ page }, info) => {
  const { lesson, view } = await student(page, "seek", info.project.name);
  const reports = progressReports(page, lesson.lessonId);
  await openPlayerHarness(page, lesson, view);
  const fake = await fakeFrame(page);
  await subscribed(fake);
  await playFrom(fake, 0, 6);
  await postFromPlayer(fake, "timeupdate", { seconds: 90, duration: 125 }); // the slider dragged far ahead
  await expect.poll(() => fake.evaluate(() => (window as unknown as { __seeks?: number[] }).__seeks ?? [])).toEqual([6]);
  const note = page.locator("[data-seek-note]");
  await expect(note).toHaveText("Edasi saab kerida kuni kohani, kuhu oled jõudnud.");
  await postFromPlayer(fake, "timeupdate", { seconds: 2, duration: 125 }); // back: free
  await postFromPlayer(fake, "pause");
  await expect.poll(() => storedProgress(lesson.clientId, lesson.lessonId)).toEqual({ watchedSec: 6, done: false });
  expect(reports).toEqual([{ watchedSec: 6 }]);
  await expect(note).toHaveText("", { timeout: 8_000 }); // gone after 6 s
  expect(await noOverflow(page)).toBe(true);
});
```

- [ ] **Step 13: Run** `npx vitest run`, tsc, lint, then `npx playwright test lesson-player account-lessons` (dev) and `E2E_PROD_BUILD=1 npx playwright test lesson-player account-lessons` — all green.

- [ ] **Step 14: Commit.**

```bash
git add app/src/domain/lessons.ts app/src/components/account/LessonPlayer.tsx app/src/components/account/LessonPlayer.module.css app/src/i18n/dict/et.ts app/src/i18n/dict/ru.ts app/tests/unit/lessons.test.ts app/tests/unit/lesson-player.test.ts app/tests/e2e/fake-bunny.ts app/tests/e2e/lesson-player.spec.ts
git commit -m "feat(player): no seeking forward past the furthest point watched; ended counts only near the end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: The menu in Jost, and one size for the list pages' titles

Spec section 4 (Menu, Page titles).
- **Menu:** `.navLink` and the phone menu's `.menuLink` use `var(--font-display)` (Jost). On a computer, 16 px / 400, with the line keeping its height.
- **Titles:** the H1 of Koolitused, Koolituskalender, Praktika, Koolitaja and Uudised take one shared class, `ui.pageTitle`, the size of "Leia oma koolitus.". Each page keeps its own margins and eyebrow.

**Files:**
- Modify: `app/src/components/site/Header.module.css`, `app/src/components/site/ui.module.css`
- Modify: `app/src/app/[locale]/(site)/koolitused/page.tsx` + `catalogue.module.css`, `koolituskalender/page.tsx` + `calendar.module.css`, `praktika/page.tsx` + `practice.module.css`, `koolitaja/page.tsx` + `trainer.module.css`, `uudised/page.tsx` + `news.module.css`
- E2E: `app/tests/e2e/look.spec.ts` (new), `app/tests/e2e/shell.spec.ts` (the menu font)

**Interfaces:**
- Produces: the class `ui.pageTitle` (`src/components/site/ui.module.css`).

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/look.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { test, expect } from "./test";

// Phase 2c (spec 4): the look changes of Maria's 06.10 feedback, at the four check widths with no horizontal overflow — the menu in
// Jost, one size for the list pages' titles (the catalogue's "Leia oma koolitus."), and (Task 5) the home page's news block on a light
// band and the footer at about half its old height.

const WIDTHS = [390, 834, 1440, 2560] as const;
const LIST_PAGES = ["/koolitused", "/koolituskalender", "/praktika", "/koolitaja", "/uudised"] as const;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const fontOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((e) => {
    const c = getComputedStyle(e);
    return { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight };
  });

test("the list pages' titles are one size (clamp(34px, 4vw, 52px)), Jost 400, at every check width", async ({ page, isMobile }) => {
  test.skip(isMobile, "the widths are set here; once is enough");
  test.setTimeout(180_000);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of LIST_PAGES) {
      await page.goto(path);
      const f = await fontOf(page, "main h1");
      expect(f.family, `${path} @ ${width}`).toMatch(/Jost/i);
      expect([f.size, f.weight], `${path} @ ${width}`).toEqual([`${Math.min(52, Math.max(34, width * 0.04))}px`, "400"]);
      expect(await noOverflow(page), `${path} @ ${width}`).toBe(true);
    }
  }
});

test("the menu is Jost 16 px / 400 on a computer and keeps its line height; the login and language buttons stay Manrope", async ({ page, isMobile }) => {
  test.skip(isMobile, "the computer's menu; the phone's is the next test");
  await page.goto("/koolitused");
  const link = page.locator("header nav").getByRole("link", { name: "Praktika" });
  const s = await link.evaluate((e) => {
    const c = getComputedStyle(e);
    return { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight, height: e.getBoundingClientRect().height };
  });
  expect(s.family).toMatch(/Jost/i);
  expect([s.size, s.weight]).toEqual(["16px", "400"]);
  expect(s.height).toBeCloseTo(52.75, 0); // 14 + 14 padding + a 24.75 px line, as with Manrope 15/1.65
  expect((await fontOf(page, "header [data-account-link]")).family).toMatch(/Manrope/i);
});

test("the phone menu is Jost too", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the phone's menu");
  await page.goto("/koolitused");
  await page.getByRole("button", { name: "Ava menüü" }).click();
  const link = page.getByRole("dialog").getByRole("link", { name: "Praktika" });
  expect(await link.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Jost/i);
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx playwright test look`): the titles differ (practice 112 px at 1440) and the menu is Manrope.
- [ ] **Step 3: Implement.**
  1. **`src/components/site/ui.module.css`.** After `.h2` (before its media query), add:

```css
/* The H1 of the list pages (Koolitused, Koolituskalender, Praktika, Koolitaja, Uudised): one size, the catalogue's "Leia oma
   koolitus." (phase 2c, Maria 06.10). The margins are each page's own. */
.pageTitle {
  font: 400 clamp(34px, 4vw, 52px) / 1.06 var(--font-display);
  letter-spacing: -0.015em;
  text-wrap: balance;
}
```

  2. **The five pages.** Each H1 takes the shared class first:
     - `koolitused/page.tsx`: `<h1 className={`${ui.pageTitle} ${styles.title}`}>`;
     - `koolituskalender/page.tsx`: the same;
     - `praktika/page.tsx`: the same;
     - `uudised/page.tsx`: the same;
     - `koolitaja/page.tsx`: `<h1 id="trainer-name" className={`${ui.pageTitle} ${styles.name}`}>`.
  3. **Their CSS modules.** Delete the `font`, `letter-spacing` and `text-wrap` declarations from `.title` in `catalogue.module.css`, `calendar.module.css`, `practice.module.css` and `news.module.css`, and from `.name` in `trainer.module.css`. Keep every `margin` (and the media queries that only change margins). Update the comments above them to "(the size: ui.pageTitle)". In `practice.module.css` the comment "H11: 'Praktika' first and largest on the page." becomes "H11: 'Praktika' first on the page; the size is the list pages' own (ui.pageTitle)."
  4. **`src/components/site/Header.module.css`.**

```css
.navLink {
  position: relative;
  padding: 14px 0;
  font: 400 16px/1.55 var(--font-display); /* Jost (phase 2c): 16 / 1.55 keeps the 15 / 1.65 line's height */
  white-space: nowrap;
  transition: color 0.18s;
}
```

     and in `.menuLink` change `font: 300 28px/1.65 var(--font-body);` to `font: 300 28px/1.65 var(--font-display);`.
- [ ] **Step 4: `tests/e2e/shell.spec.ts`.**
  - In "header and footer", `expect(navFont).toMatch(/Manrope/i);` becomes `expect(navFont).toMatch(/Jost/i); // phase 2c: the menu in Jost`.
  - Rename "menu, login and language switch are Manrope 500 15px (G4)" to "login and language switch are Manrope 500 15px (G4); the menu is Jost (phase 2c, look.spec.ts)", and delete its first loop entry (the `header.getByRole("navigation").getByRole("link", { name: "Praktika" })` line).
- [ ] **Step 5: Run** `npx playwright test look shell pages catalogue` (dev) — green. Run `npm run visual` and look at `koolitused`, `koolituskalender`, `praktika`, `koolitaja` and `uudised` at 390 and 1440: one title size, nothing overlaps.
- [ ] **Step 6: Commit.**

```bash
git add app/src/components/site/Header.module.css app/src/components/site/ui.module.css "app/src/app/[locale]/(site)" app/tests/e2e/look.spec.ts app/tests/e2e/shell.spec.ts
git commit -m "feat(look): the menu in Jost; one title size for the list pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The home page's news band and the half-height footer

Spec section 4 (Home news block, Footer).
- **News block:** `BlogCarousel`'s section becomes a full-width band in `var(--canvas)`, like FormatsBlock, with its content in `ui.wrap` and the cards in the news list's light style on paper.
- **Footer:** one block of two columns.
  - Left (≈ 2/3): the logo and tagline, "Õpi", the organisation links and "Kohtume", tighter.
  - Right (≈ 1/3): the newsletter as a smaller lilac card: title ≈ 28 px, text, e-mail, "Liitu" and the consent under each other.
  - The bottom row stays as it is. The target is ≤ 460 px at 1440 wide.
  - Below 900 px it stacks, the card first (as today). The account pages still hide the newsletter.

**Files:**
- Modify: `app/src/components/site/BlogCarousel.tsx`, `BlogCarousel.module.css`
- Modify: `app/src/components/site/Footer.tsx`, `Footer.module.css`, `Newsletter.module.css`
- Modify: `app/src/styles/globals.css` (the account pages' rule)
- E2E: `app/tests/e2e/look.spec.ts` (append)

**Interfaces:**
- Produces: `data-news-band` on the news section; `data-footer-top` on the footer's two-column block (the account pages' CSS rule uses it).

- [ ] **Step 1: Write the failing e2e tests.** Append to `tests/e2e/look.spec.ts`:

```ts
test("the home page's news block is a full-width band in the canvas colour, its cards on paper", async ({ page }) => {
  await page.goto("/");
  const band = page.locator("[data-news-band]");
  await expect(band).toHaveAccessibleName("Uudised ja nõuanded");
  const box = (await band.boundingBox())!;
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect([Math.round(box.x), Math.round(box.width)]).toEqual([0, width]);
  expect(await band.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(246, 244, 245)"); // --canvas
  const card = band.getByRole("link", { name: /Kuidas valida endale sobiv kulmukoolitus/ });
  expect(await card.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 255, 255)"); // --paper
});

test("the footer at 1440: the links at the left, the newsletter card at the right, at most 460 px high", async ({ page, isMobile }) => {
  test.skip(isMobile, "1440 wide");
  await page.goto("/");
  const footer = page.locator("footer");
  expect((await footer.boundingBox())!.height).toBeLessThanOrEqual(460);
  const card = (await footer.locator("[data-footer-newsletter]").boundingBox())!;
  const links = (await footer.getByRole("link", { name: "Kõik koolitused" }).boundingBox())!;
  expect(card.x).toBeGreaterThan(links.x);
  expect(card.y).toBeLessThan(links.y + links.height); // side by side, not under each other
  await expect(footer.getByRole("heading", { level: 2, name: /Hea järgmine samm/ })).toHaveCSS("font-size", "28px");
});

test("below 900 px the newsletter card comes first, then the links; no page overflows at the check widths", async ({ page, isMobile }) => {
  test.skip(isMobile, "the widths are set here");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/");
  const footer = page.locator("footer");
  const card = (await footer.locator("[data-footer-newsletter]").boundingBox())!;
  const links = (await footer.getByRole("link", { name: "Kõik koolitused" }).boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(links.y);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/ru", "/kontakt"]) {
      await page.goto(path);
      expect(await noOverflow(page), `${path} @ ${width}`).toBe(true);
    }
  }
});
```

- [ ] **Step 2: Run it — expect FAIL**: there is no `[data-news-band]`, and the footer is about 880 px high.
- [ ] **Step 3: The news band.**
  1. **`BlogCarousel.tsx`.** Change the doc comment's first line to "The home page's news block (prototype D's blog row, phase 2c: a light band like 'Kuidas soovid õppida?'):". Replace the returned markup with:

```tsx
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`} data-news-band="">
      <div className={ui.wrap}>
        <div className={styles.head}>
          <div>
            <p className={ui.caps}>{t.eyebrow}</p>
            <h2 id={`${id}-title`} className={ui.h2}>
              {t.title}
            </h2>
          </div>
          <p className={styles.lead}>{t.lead}</p>
        </div>
        <div className={styles.rule} />
        <div ref={track} className={styles.track} tabIndex={0} role="group" aria-label={t.carouselLabel}>
          {posts.map((p) => (
            <Link key={p.slug} className={styles.card} href={p.href}>
              <span className={styles.photo}>
                {p.cover && <Image className={styles.image} src={p.cover} alt="" fill unoptimized sizes="(max-width: 640px) 80vw, 340px" />}
              </span>
              <div className={styles.body}>
                <span className={styles.meta}>
                  {p.date} · {p.category}
                </span>
                <h3 className={styles.title}>{p.title}</h3>
                <span className={styles.excerpt}>{p.excerpt}</span>
              </div>
            </Link>
          ))}
        </div>
        <div className={styles.foot}>
          <Link className={ui.more} href={allHref}>
            {t.all}
          </Link>
          <div className={styles.buttons}>
            <button type="button" aria-label={t.prev} aria-disabled={edges.start || undefined} onClick={() => scroll(-1)}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <button type="button" aria-label={t.next} aria-disabled={edges.end || undefined} onClick={() => scroll(1)}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
```

  2. **`BlogCarousel.module.css`.** Replace the whole file with:

```css
/* The home page's news block (phase 2c, Maria 06.10): a full-width band in the canvas colour, as "Kuidas soovid õppida?"
   (FormatsBlock), its content in the page's wrap; the cards in the light card style of the news list (NewsCard: 4:3 photo,
   date · category, Jost title, excerpt) on paper; a scroll-snap row with "Kõik postitused" and the previous / next buttons
   (aria-disabled at the ends). Tokens only. */

.section {
  padding: clamp(72px, 8vw, 120px) 0;
  background: var(--canvas);
}

.head {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 16px 48px;
  align-items: end;
}

.lead {
  justify-self: end;
  max-width: 420px;
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.55;
}

.rule {
  height: 1px;
  margin: clamp(24px, 3vw, 40px) 0;
  background: var(--line);
}

.track {
  display: grid;
  grid-auto-columns: min(80%, 340px);
  grid-auto-flow: column;
  gap: 18px;
  padding: 4px 0 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.track::-webkit-scrollbar {
  display: none;
}

.track:focus-visible {
  outline-offset: 2px;
}

/* NewsCard .card, on paper (the band is canvas) */
.card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--paper);
  color: var(--ink);
  text-decoration: none;
  scroll-snap-align: start;
  transition:
    transform 0.45s var(--ease),
    box-shadow 0.45s var(--ease);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 40px -22px color-mix(in srgb, var(--ink) 35%, transparent);
}

.photo {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--first);
}

.image {
  object-fit: cover;
  transition: transform 0.9s var(--ease);
}

.card:hover .image {
  transform: scale(1.05);
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 22px 24px 26px;
}

.meta {
  color: var(--muted);
  font: 500 12px/1.2 var(--font-body);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.title {
  margin: 0;
  font: 400 21px/1.25 var(--font-display);
  letter-spacing: -0.005em;
}

.excerpt {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.55;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 24px;
}

.buttons {
  display: flex;
  gap: 8px;
}

.buttons button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
  transition: border-color 0.3s;
}

.buttons button:hover:not([aria-disabled="true"]) {
  border-color: var(--ink);
}

.buttons button[aria-disabled="true"] {
  opacity: 0.35;
  cursor: default;
}

@media (max-width: 760px) {
  .head {
    grid-template-columns: 1fr;
  }

  .lead {
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card:hover,
  .card:hover .image {
    transform: none;
  }
}
```

- [ ] **Step 4: The footer.**
  1. **`Footer.tsx`.** Replace the doc comment and the returned markup:

```tsx
/**
 * B footer, half its old height (phase 2c, Maria 06.10): one block of two columns — the logo and slogan, "Õpi", the organisation's
 * links and "Kohtume" at the left (about 2/3), the lilac newsletter card at the right (about 1/3) — and the bottom line. The card
 * comes first in the page, so below 900 px, where the two stack, it is on top (as before). Contact details and the newsletter's
 * discount come from the settings table. The account's pages hide the card (globals.css): the links then take the whole width.
 */
export function Footer({ locale, newsletter, contact, trainerName }: { locale: Locale; newsletter: NewsletterSettings; contact?: FooterContact; trainerName?: string }) {
  const d = getDict(locale);
  const to = (path: string) => href(locale, path);

  return (
    <footer className={styles.footer}>
      <div className={styles.top} data-footer-top="">
        <Newsletter
          locale={locale}
          t={{
            ...d.newsletter,
            body: fill(d.newsletter.body, { discount: newsletter.discountLabel }),
            sentText: d.newsletter.confirmText,
            errorEmail: d.forms.errorEmail,
            errorRequired: d.forms.errorRequired,
            errorTooMany: d.forms.errorTooMany,
            errorGeneric: d.forms.errorGeneric,
          }}
        />
        <div className={styles.main}>
          <div>
            <Logo href={to("/")} label={d.nav.home} className={styles.logo} />
            <p className={styles.text}>{d.footer.tagline}</p>
          </div>
          <div>
            <h2 className={styles.title}>{d.footer.learnTitle}</h2>
            <Link className={styles.link} href={to("/koolitused")}>
              {d.footer.allCourses}
            </Link>
            <Link className={styles.link} href={to("/koolituskalender")}>
              {d.nav.calendar}
            </Link>
            <Link className={styles.link} href={to("/praktika")}>
              {d.nav.practice}
            </Link>
          </div>
          <div>
            <h2 className={styles.title}>{d.footer.orgTitle}</h2>
            <Link className={styles.link} href={to("/koolitaja")}>
              {trainerName || d.nav.trainer}
            </Link>
            <Link className={styles.link} href={to("/uudised")}>
              {d.footer.news}
            </Link>
            <Link className={styles.link} href={to("/kontakt")}>
              {d.footer.contact}
            </Link>
          </div>
          <div>
            <h2 className={styles.title}>{d.footer.meetTitle}</h2>
            <p className={styles.text}>
              {d.footer.cities}
              <br />
              {d.footer.online}
            </p>
            {contact?.email && (
              <a className={`${styles.link} ${styles.contact}`} href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            )}
            {contact?.phone && (
              <a className={styles.link} href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                {contact.phone}
              </a>
            )}
            {contact?.instagram && (
              <a className={styles.link} href={contact.instagram} target="_blank" rel="noopener noreferrer">
                Instagram ↗
              </a>
            )}
            {contact?.facebook && (
              <a className={styles.link} href={contact.facebook} target="_blank" rel="noopener noreferrer">
                Facebook ↗
              </a>
            )}
            <Link className={`${styles.link} ${styles.cta}`} href={to("/kontakt")}>
              {d.footer.contactCta} ↗
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>{fill(d.footer.copyright, { year: new Date().getFullYear() })}</span>
        <div className={styles.legal}>
          <Link className={styles.link} href={to("/privaatsus")}>
            {d.footer.privacy}
          </Link>
          <Link className={styles.link} href={to("/tingimused")}>
            {d.footer.terms}
          </Link>
        </div>
      </div>
    </footer>
  );
}
```

  2. **`Footer.module.css`.** Replace the whole file with:

```css
/* Prototype B .footer, half its old height (phase 2c, Maria 06.10): one block — the link columns at the left (about 2/3), the
   newsletter card (Newsletter.module.css) at the right (about 1/3) — and the bottom line. The card is first in the page: below
   900 px the two stack with the card on top. B's footer greys are kept as they were. */

.footer {
  margin-top: 80px;
  padding: 40px var(--page) 20px;
  background: var(--ink);
  color: #fff;
  font-family: var(--font-body);
  line-height: 1.6;
}

:where(.footer) a {
  color: inherit;
  text-decoration: none;
}

.top {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  grid-template-areas: "links news";
  gap: 40px;
  align-items: start;
}

.top > [data-footer-newsletter] {
  grid-area: news;
}

.main {
  display: grid;
  grid-area: links;
  grid-template-columns: 1.4fr 1fr 1fr 1.3fr;
  gap: 28px;
}

.logo {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  width: 140px;
  height: 55px;
}

.logo img {
  display: block;
  width: 138px;
  height: auto;
  filter: invert(1);
  mix-blend-mode: screen;
}

.text {
  max-width: 220px;
  margin: 12px 0 0;
  color: #b7afb3;
  font-size: 12px;
}

.title {
  margin: 0 0 12px;
  color: #fff;
  font: 500 12px/1.6 var(--font-body);
  letter-spacing: normal;
}

.link {
  display: block;
  width: fit-content;
  margin-bottom: 6px;
  color: #c9c1c5;
  font-size: 12px;
}

.link:hover {
  color: #fff;
}

.contact {
  margin-top: 8px;
}

.cta {
  margin-top: 12px;
}

.bottom {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid #494347;
  color: #a9a0a5;
  font-size: 10px;
}

.legal {
  display: flex;
  gap: 14px;
}

.legal .link {
  margin-bottom: 0;
}

@media (max-width: 1180px) {
  .main {
    grid-template-columns: 1fr 1fr;
  }
}

/* Touch screens: links get a 44px target (B's 12px lines are ~20px). */
@media (max-width: 1099px) {
  .link {
    display: flex;
    align-items: center;
    min-height: 44px;
    margin-bottom: 0;
  }

  .contact,
  .cta {
    margin-top: 4px;
  }

  .title {
    margin-bottom: 8px;
  }
}

@media (max-width: 899px) {
  .top {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "news"
      "links";
    gap: 36px;
  }
}

@media (max-width: 640px) {
  .footer {
    margin-top: 40px;
    padding: 36px var(--page) 20px;
  }

  .main {
    gap: 24px;
  }

  .main > div:first-child {
    grid-column: 1 / -1;
  }

  .bottom {
    flex-direction: column;
    gap: 10px;
  }
}
```

  3. **`Newsletter.module.css`.** The card becomes one narrow column. Replace the rules from `.newsletter` down to `.check input` (keep `.sentTitle`, `.error` and `.honeypot`) and the three media queries at the end with:

```css
/* Prototype B .newsletter: lilac surface with white / ink / lilac (Maria C10), a narrow card in the footer's right column (phase 2c):
   the title, the text, then the e-mail, "Liitu" and the consent under each other. The label is for screen readers (the field's
   placeholder shows the shape); the home page's newsletter popup uses the same form (NewsletterForm). */

.newsletter {
  display: flex;
  flex-direction: column;
  padding: 22px 24px;
  border-radius: 20px;
  background: var(--lilac);
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.6;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.025em;
}

.eyebrow::before {
  content: "";
  width: 22px;
  height: 1px;
  background: currentColor;
  opacity: 0.5;
}

.title {
  margin: 8px 0 0;
  font: 400 28px/1.08 var(--font-display);
  letter-spacing: -0.01em;
}

.text {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.55;
}

.form {
  margin-top: 12px;
}

.label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input {
  width: 100%;
  min-width: 0;
  min-height: 46px;
  padding: 12px 18px;
  border: 1px solid #c6b8c0;
  border-radius: 99px;
  background: #f9f6f8;
  color: var(--ink);
  font: 400 15px/1.2 var(--font-body);
}

.input:focus {
  border-color: var(--rose);
}

.submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  width: 100%;
  min-height: 46px;
  padding: 12px 24px;
  border: 1px solid var(--ink);
  border-radius: 99px;
  background: var(--ink);
  color: #fff;
  font: 600 13px/1.2 var(--font-body);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.2s,
    transform 0.2s;
}

.submit:hover {
  background: #40383c;
  transform: translateY(-2px);
}

.submit:active {
  transform: translateY(0) scale(0.98);
}

.submit[aria-disabled="true"] {
  opacity: 0.6;
  cursor: progress;
  transform: none;
}

/* The rose focus ring is below 3:1 on the lilac surface: controls here get the ink ring. */
.newsletter :focus-visible {
  outline-color: var(--ink);
}

.status:focus {
  outline: none;
}

.status:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 4px;
}

/* The whole label is the hit area: at least 44px high (touch targets). */
.check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 44px;
  margin-top: 2px;
  padding-block: 10px;
  color: #61555d;
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}

.check input {
  flex-shrink: 0;
  width: 17px;
  height: 17px;
  margin: 0;
  accent-color: var(--ink);
}
```

     and, after `.honeypot`, the only media query left:

```css
@media (max-width: 640px) {
  .input {
    font-size: 16px; /* no zoom on focus in iOS */
  }
}
```

  4. **`src/styles/globals.css`.** Replace the second rule of the account pages' block (`body:has([data-account-shell]) [data-footer-newsletter] + * { margin-top: 0; }`) with the following, and change "The link columns that follow lose the room they kept under the form." in the comment to "The link columns then take the whole footer.":

```css
body:has([data-account-shell]) [data-footer-top] {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "links";
}
```

- [ ] **Step 5: Run** `npx playwright test look shell home forms account-details feedback` (dev).
  - If the footer measures over 460 px at 1440, tighten only paddings and gaps inside the footer and the card (`.footer`, `.top`, `.bottom`, `.newsletter`, `.title`, `.text` margins). Keep the 44 px targets and the 28 px title.
- [ ] **Step 6: Visual check.** Run `npm run visual`. At 390, 834, 1440 and 2560, look at `avaleht` and `kontakt`: the band, its cards, and the footer (card right at 1440 and 2560, on top at 390 and 834). In Russian too: `avaleht` RU, whose title has two longer lines.
- [ ] **Step 7: Commit.**

```bash
git add app/src/components/site/BlogCarousel.tsx app/src/components/site/BlogCarousel.module.css app/src/components/site/Footer.tsx app/src/components/site/Footer.module.css app/src/components/site/Newsletter.module.css app/src/styles/globals.css app/tests/e2e/look.spec.ts
git commit -m "feat(look): the home news block on a light band; the footer at half its height with a narrow newsletter card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Dashboard progress — the "Pooleli" card and the cards' bars

Spec section 4 (Dashboard).
- **`GET /api/konto`** adds to each e-course card with active access `progress: { done, total, next: { lessonId, title, moduleTitle } | null }`, over visible lessons only. `progress` is `null` when the course has no visible lessons.
- **The "Pooleli" card** at the top of "Minu koolitused": a dark card for the e-course with the latest progress activity that is not finished. With no activity anywhere, the first open e-course with lessons, which then says "Alusta". Finished or lesson-less courses get no card.
- **Each e-course card** gets a thin bar with "{done} / {total}", or "Läbitud ✓" when finished.
- Which course the dark card is for is decided on the server: the dashboard gains `resume: string | null`, the course's slug. The time of her last activity never leaves the server.

**Files:**
- Modify: `app/src/domain/account-cards.ts`, `app/src/server/lesson-outline.ts`, `app/src/server/client-data.ts`
- Create: `app/src/components/account/ProgressBar.tsx`, `ProgressBar.module.css`, `ResumeCard.tsx`, `ResumeCard.module.css`
- Modify: `app/src/components/account/EcourseView.tsx`, `EcourseView.module.css`, `CoursesTab.tsx`, `AccountCourseCard.tsx`, `AccountCourseCard.module.css`
- Modify: `app/src/i18n/dict/et.ts`, `ru.ts` (`account.dashboard`)
- Test: `app/tests/unit/account-cards.test.ts`, `app/tests/unit/account-dashboard.test.ts`, `app/tests/db/client-data.test.ts`, `app/tests/unit/colour-tokens.test.ts`, `app/tests/e2e/account-dashboard.spec.ts`
- Update (the new `resume` field): `app/tests/unit/account-dashboard-dom.test.ts`, `account-dashboard.test.ts`, `account-readonly.test.ts`, `account-types.test.ts`, `account-details-dom.test.ts`, `app/tests/db/account-api.test.ts`; (`progress: null`) `app/tests/db/client-data.test.ts`, `app/tests/db/admin-clients.test.ts`

**Interfaces:**
- Produces, from `src/domain/account-cards.ts`:
  - `type EcourseProgress = { done: number; total: number; next: { lessonId: number; title: I18n; moduleTitle: I18n } | null }`;
  - `EcourseCard.progress?: EcourseProgress | null` (present for an active access: the object, or `null` without visible lessons; absent for an ended one);
  - `resumeSlug(cards: readonly AccountCard[], activity: ReadonlyMap<string, number>, now: Date): string | null`.
- Produces, from `src/server/lesson-outline.ts`:
  - `ecourseProgress(outline: CourseOutline): EcourseProgress | null`;
  - `progressActivity(db: Db, clientId: number): Promise<Map<number, Date>>` (course id → her last lesson row write).
- Produces, from `src/server/client-data.ts`: `Dashboard.resume: string | null`.
- Produces, as components:
  - `ProgressBar({ done, total, labelledBy?, label?, tone? })` (`tone`: `"light"` | `"dark"`);
  - `ResumeCard({ card, progress, locale, t, readOnly })`.
- Produces, in `account.dashboard`: `resumeTag`, `resumeWhere`, `resumeProgress`, `resumeContinue`, `resumeBegin`, `lessonCount`, `finished`.

- [ ] **Step 1: Write the failing unit test** in `tests/unit/account-cards.test.ts`. Add `resumeSlug` and `type EcourseProgress` to its import:

```ts
describe("resumeSlug: the e-course of the 'Pooleli' card (phase 2c)", () => {
  const NOW_D = new Date("2026-10-08T10:00:00.000Z");
  const progress = (done: number, total: number): EcourseProgress => ({ done, total, next: done < total ? { lessonId: done + 1, title: { et: `L${done + 1}` }, moduleTitle: { et: "M" } } : null });
  const card = (slug: string, p: EcourseProgress | null | undefined, over: Record<string, unknown> = {}) =>
    ({ kind: "ecourse", course: { slug, title: { et: slug } }, grantedAt: "2026-10-01T09:00:00.000Z", expiresAt: "2027-04-01T09:00:00.000Z", revoked: false, progress: p, ...over }) as AccountCard;

  test("the open, unfinished e-course she did something in last", () => {
    const cards = [card("a", progress(1, 3)), card("b", progress(2, 5))];
    expect(resumeSlug(cards, new Map([["a", 100], ["b", 200]]), NOW_D)).toBe("b");
    expect(resumeSlug(cards, new Map([["a", 300], ["b", 200]]), NOW_D)).toBe("a");
  });

  test("with no activity in any of them: the first such course in the cards' order (it says 'Alusta')", () => {
    expect(resumeSlug([card("a", progress(0, 3)), card("b", progress(0, 2))], new Map(), NOW_D)).toBe("a");
    expect(resumeSlug([card("a", progress(0, 3)), card("b", progress(1, 2))], new Map([["b", 5]]), NOW_D)).toBe("b");
  });

  test("none for a finished course, one without lessons, an ended access, or none at all", () => {
    expect(resumeSlug([card("a", progress(3, 3))], new Map([["a", 1]]), NOW_D)).toBeNull();
    expect(resumeSlug([card("a", null), card("b", undefined)], new Map(), NOW_D)).toBeNull();
    expect(resumeSlug([card("a", progress(1, 3), { revoked: true })], new Map([["a", 1]]), NOW_D)).toBeNull();
    expect(resumeSlug([card("a", progress(1, 3), { expiresAt: "2026-10-01T00:00:00.000Z" })], new Map(), NOW_D)).toBeNull();
    expect(resumeSlug([], new Map(), NOW_D)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**: "resumeSlug is not exported".
- [ ] **Step 3: Implement** in `src/domain/account-cards.ts`.
  1. Before `EcourseCard`, add:

```ts
/**
 * An open e-course's lessons for the student (phase 2c; visible lessons only): how many are done of how many, and the next one to open
 * (the first open lesson not done, with its module's title), null when every lesson is done.
 */
export type EcourseProgress = { done: number; total: number; next: { lessonId: number; title: I18n; moduleTitle: I18n } | null };
```

  2. In `EcourseCard`, after `revoked`, add:

```ts
  /** Present for an active access: its lessons (null without visible lessons); absent for an access that has ended. */
  progress?: EcourseProgress | null;
```

  3. After `sortCards`, add:

```ts
/**
 * Which e-course the dark "Pooleli" card at the top of "Minu koolitused" is for (spec 4). Of her open e-courses with a lesson left
 * (an active access, and a progress with a next lesson), the one she did something in last. `activity` maps a course slug to the time
 * in ms of her last lesson row write. With no activity in any of them, the first such course in the cards' order: the card then
 * says "Alusta". null: none — every course finished, none with lessons, none open.
 */
export function resumeSlug(cards: readonly AccountCard[], activity: ReadonlyMap<string, number>, now: Date): string | null {
  let best: { slug: string; at: number } | null = null;
  for (const card of cards) {
    if (card.kind !== "ecourse" || isPastCard(card, now) || !card.progress?.next) continue;
    const at = activity.get(card.course.slug) ?? -Infinity;
    if (best === null || at > best.at) best = { slug: card.course.slug, at };
  }
  return best?.slug ?? null;
}
```

- [ ] **Step 4: Run** it — expect PASS.
- [ ] **Step 5: Write the failing DB tests.** Append to `tests/db/client-data.test.ts`. Import `lessons` and `lessonProgress` from `@/db/schema`; `addModules` is in `./helpers`:

```ts
describe("e-course progress on the dashboard (phase 2c)", () => {
  /** An e-course of `n` text lessons in one module "M" (L1…Ln), published. */
  async function lessonCourse(slug: string, n: number) {
    const [course] = await db.insert(courses).values({ ...base, slug, type: "e_learning", title: { et: slug }, published: true, price: 100 }).returning();
    const [m] = await addModules(db, course.id, [{ et: "M" }]);
    const list = [];
    for (let i = 1; i <= n; i++) list.push((await db.insert(lessons).values({ moduleId: m.id, position: i, title: { et: `L${i}` }, kind: "text" }).returning())[0]);
    return { course, lessons: list };
  }

  test("an open e-course carries done of total and the next lesson with its module; one without lessons null; an ended access none", async () => {
    const kati = await client();
    const a = await lessonCourse("kursus-a", 3);
    await grant(kati.id, a.course.id);
    await grant(kati.id, f.online.id); // modules, no lessons
    const ended = await lessonCourse("kursus-vana", 1);
    await grant(kati.id, ended.course.id, { expiresAt: at(-1), grantedAt: at(-30) });
    await db.insert(lessonProgress).values({ clientId: kati.id, lessonId: a.lessons[0].id, doneAt: NOW });
    const { cards } = (await loadDashboard(db, kati.id, NOW))!;
    const card = (slug: string) => cards.find((c) => c.kind === "ecourse" && c.course.slug === slug)!;
    expect(card("kursus-a")).toMatchObject({ progress: { done: 1, total: 3, next: { lessonId: a.lessons[1].id, title: { et: "L2" }, moduleTitle: { et: "M" } } } });
    expect(card("veebikursus")).toMatchObject({ progress: null });
    expect(card("kursus-vana")).not.toHaveProperty("progress");
  });

  test("the 'Pooleli' card is for the e-course she did something in last; with no activity the first open one with lessons; none when all are finished", async () => {
    const kati = await client();
    const a = await lessonCourse("kursus-a", 2);
    const b = await lessonCourse("kursus-b", 2);
    await grant(kati.id, a.course.id, { grantedAt: at(-3) });
    await grant(kati.id, b.course.id, { grantedAt: at(-2) });
    const resume = async () => (await loadDashboard(db, kati.id, NOW))!.resume;
    expect(await resume()).toBe("kursus-b"); // no activity: the cards' order, the newest grant first
    await db.insert(lessonProgress).values({ clientId: kati.id, lessonId: a.lessons[0].id, updatedAt: at(-1) });
    expect(await resume()).toBe("kursus-a");
    await db.insert(lessonProgress).values({ clientId: kati.id, lessonId: b.lessons[0].id, updatedAt: NOW });
    expect(await resume()).toBe("kursus-b");
    // b finished: back to a; both finished: none
    await db.update(lessonProgress).set({ doneAt: NOW }).where(eq(lessonProgress.lessonId, b.lessons[0].id));
    await db.insert(lessonProgress).values({ clientId: kati.id, lessonId: b.lessons[1].id, doneAt: NOW, updatedAt: NOW });
    expect(await resume()).toBe("kursus-a");
    await db.update(lessonProgress).set({ doneAt: NOW }).where(eq(lessonProgress.lessonId, a.lessons[0].id));
    await db.insert(lessonProgress).values({ clientId: kati.id, lessonId: a.lessons[1].id, doneAt: NOW });
    expect(await resume()).toBeNull();
  });
});
```

     In the same file, two existing expectations now see the new fields:
     - in "e-course access: active, expired and revoked are cards …", `expect(cards[1]).toEqual({ kind: "ecourse", … revoked: false })` gains `progress: null` (veebikursus is open and has no lessons);
     - in `tests/db/admin-clients.test.ts` "Ava ligipääs: until the end of the chosen Estonian day …", the expected card in `expect(dash.cards).toEqual([{ kind: "ecourse", … revoked: false }])` gains `progress: null` too.
- [ ] **Step 6: Run it — expect FAIL**: no `progress`, no `resume`.
- [ ] **Step 7: Implement the server side.**
  1. **`src/server/lesson-outline.ts`.** Add the imports `max` (from `drizzle-orm`), `Db` is imported already, and `type EcourseProgress` from `@/domain/account-cards`. Append:

```ts
/** One e-course's lessons for the dashboard (phase 2c): done of total and the next lesson with its module's title; null without visible lessons. */
export function ecourseProgress(outline: CourseOutline): EcourseProgress | null {
  const { done, total, next } = outline.progress;
  if (total === 0) return null;
  const lesson = next === null ? undefined : outline.lessons.find((l) => l.id === next);
  const module = lesson ? outline.modules.find((m) => m.id === lesson.moduleId) : undefined;
  return { done, total, next: lesson && module ? { lessonId: lesson.id, title: lesson.title, moduleTitle: module.title } : null };
}

/**
 * When she last did anything in each course's lessons (phase 2c, the "Pooleli" card): course id → the latest write of her progress
 * rows (a lesson opened, watched, marked done, or opened for her by an admin). One query.
 */
export async function progressActivity(db: Db, clientId: number): Promise<Map<number, Date>> {
  const rows = await db
    .select({ courseId: courseModules.courseId, at: max(lessonProgress.updatedAt) })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .where(eq(lessonProgress.clientId, clientId))
    .groupBy(courseModules.courseId);
  return new Map(rows.flatMap((r) => (r.at ? [[r.courseId, r.at] as const] : [])));
}
```

  2. **`src/server/client-data.ts`.**
     - Imports: `resumeSlug` and `type EcourseCard` from `@/domain/account-cards`; `courseOutline`, `ecourseProgress` and `progressActivity` from `./lesson-outline` (`courseOutline` is imported already).
     - In `Dashboard`, after `prepayment`, add:

```ts
  /** The slug of the e-course the "Pooleli" card is for (domain/account-cards.ts resumeSlug); null: no card. */
  resume: string | null;
```

     - In the access query's select, add `courseId: courseAccess.courseId,`.
     - Replace the e-course loop and the return with:

```ts
  // each open e-course's lessons (visible ones only), and when she last did anything in each course's lessons (phase 2c)
  const open = accessRows.filter((a) => a.revokedAt === null && a.expiresAt > now);
  const [outlines, activity] = await Promise.all([Promise.all(open.map((a) => courseOutline(db, a.courseId, clientId))), progressActivity(db, clientId)]);
  const progressOf = new Map(open.map((a, i) => [a.slug, ecourseProgress(outlines[i])]));
  for (const a of accessRows) {
    const card: EcourseCard = { kind: "ecourse", course: { slug: a.slug, title: a.title }, grantedAt: iso(a.grantedAt), expiresAt: iso(a.expiresAt), revoked: a.revokedAt !== null };
    if (progressOf.has(a.slug)) card.progress = progressOf.get(a.slug) ?? null;
    cards.push(card);
  }
  const sorted = sortCards(cards, now);
  const lastAt = new Map(open.flatMap((a) => {
    const at = activity.get(a.courseId);
    return at ? [[a.slug, at.getTime()] as const] : [];
  }));

  return {
    client: { email: client.email, name: client.name, phone: client.phone, locale: client.locale, newsletter: client.newsletter },
    cards: sorted,
    favourites,
    prepayment: parsePrepayment(prepayment),
    resume: resumeSlug(sorted, lastAt, now),
  };
```

     - Extend `loadDashboard`'s doc comment: "…the prepayment setting; then, for each open e-course, its lessons (two queries each) and her last lesson activity (one query), for the cards' progress and the 'Pooleli' card (`resume`)."
- [ ] **Step 8: The new field in the tests' dashboards.** Add `resume: null,` after `prepayment` in each `Dashboard` literal:
  - `tests/unit/account-dashboard-dom.test.ts`, `account-dashboard.test.ts`, `account-readonly.test.ts`, `account-types.test.ts`, `account-details-dom.test.ts` (each has one `dashboard` fixture or `data` constant);
  - the full expected answer in "the session's client: profile, cards, favourites and the prepayment instructions; …" of `tests/db/account-api.test.ts` (the `toEqual({ client, cards, favourites: ["veebikursus"], prepayment })`).
- [ ] **Step 9: Run** `npx vitest run tests/db/client-data.test.ts tests/db/admin-clients.test.ts tests/db/account-api.test.ts tests/unit/account-cards.test.ts` — expect PASS.
- [ ] **Step 10: The dictionaries.** In `account.dashboard`, before `loading`:
  - `et.ts`:

```ts
      // The dark "Pooleli" card at the top (components/account/ResumeCard.tsx) and the e-course cards' lessons (phase 2c): {module} and
      // {lesson} are the next lesson's module and title, {done} and {total} count the lessons. "Jätka" ("Alusta" before the first one is
      // done) opens the next lesson; a finished course says "Läbitud ✓".
      resumeTag: "Pooleli",
      resumeWhere: "{module} · {lesson}",
      resumeProgress: "{done} / {total} õppetundi tehtud",
      resumeContinue: "Jätka",
      resumeBegin: "Alusta",
      lessonCount: "{done} / {total}",
      finished: "Läbitud ✓",
```

  - `ru.ts`:

```ts
      resumeTag: "В процессе",
      resumeWhere: "{module} · {lesson}",
      resumeProgress: "Пройдено уроков: {done} / {total}",
      resumeContinue: "Продолжить",
      resumeBegin: "Начать",
      lessonCount: "{done} / {total}",
      finished: "Пройден ✓",
```

- [ ] **Step 11: Write the failing render tests.** Append to `tests/unit/account-dashboard.test.ts`. Add `type EcourseCard` to the `@/domain/account-cards` import:

```ts
describe("the 'Pooleli' card and the e-course cards' lessons (phase 2c)", () => {
  const withLessons = (done: number, total: number): EcourseCard => ({
    kind: "ecourse", course: ecourse, grantedAt: NOW, expiresAt: "2027-04-03T10:00:00.000Z", revoked: false,
    progress: { done, total, next: done < total ? { lessonId: 12, title: { et: "Värvid", ru: "Цвета" }, moduleTitle: { et: "Alused" } } : null },
  });
  const one = (card: EcourseCard, resume: string | null) => dashboard({ cards: [card], resume });

  test("at the top: the tag, the course, '{module} · {lesson}', the bar and its sentence, and 'Jätka' to the next lesson", () => {
    const html = render("et", { data: one(withLessons(1, 3), ecourse.slug) });
    const card = html.slice(html.indexOf("data-resume-card"), html.indexOf("data-account-cards"));
    expect(card).toContain(">Pooleli<");
    expect(card).toContain("Kulmumeistri e-koolitus");
    expect(card).toContain("Alused · Värvid");
    expect(card).toContain("1 / 3 õppetundi tehtud");
    expect(card).toMatch(/role="progressbar"[^>]*aria-valuenow="1"/);
    expect(card).toContain(`href="/konto/kursus/${ecourse.slug}/12"`);
    expect(card).toContain("Jätka");
    expect(html.indexOf("data-resume-card")).toBeLessThan(html.indexOf("data-account-cards")); // above the cards
  });

  test("before the first lesson is done the button says 'Alusta'; no card without `resume`", () => {
    expect(render("et", { data: one(withLessons(0, 3), ecourse.slug) })).toContain("Alusta");
    expect(render("et", { data: one(withLessons(1, 3), null) })).not.toContain("data-resume-card");
  });

  test("the e-course card: '{done} / {total}' with the thin bar; a finished one 'Läbitud ✓' and no bar", () => {
    const open = cardHtml(render("et", { data: one(withLessons(2, 5), null) }), `course-${ecourse.slug}`);
    expect(open).toContain(">2 / 5<");
    expect(open).toMatch(/role="progressbar"[^>]*aria-label="2 \/ 5 õppetundi tehtud"/);
    const done = cardHtml(render("et", { data: one(withLessons(5, 5), null) }), `course-${ecourse.slug}`);
    expect(done).toContain("Läbitud ✓");
    expect(done).not.toContain("progressbar");
  });

  test("the admin's read-only view: the card's button is there but does nothing", () => {
    const html = render("et", { data: one(withLessons(1, 3), ecourse.slug), readOnly: true });
    expect(html).toMatch(/<a[^>]*aria-disabled="true"[^>]*data-resume-next=""/);
    expect(html).not.toContain(`href="/konto/kursus/${ecourse.slug}/12"`);
  });

  test("Russian", () => {
    const html = render("ru", { data: one(withLessons(1, 3), ecourse.slug) });
    expect(html).toContain("В процессе");
    expect(html).toContain("Пройдено уроков: 1 / 3");
    expect(html).toContain("Продолжить");
  });
});
```

- [ ] **Step 12: Run it — expect FAIL.**
- [ ] **Step 13: The components.**
  1. **Create `ProgressBar.tsx`:**

```tsx
import styles from "./ProgressBar.module.css";

/**
 * A thin progress bar (the e-course page's, phase 3a; shared in phase 2c with the dashboard's cards): `done` of `total`, named by the
 * element `labelledBy` points to, or by `label`. `tone`: "light" (ink on the line colour) or "dark" (paper on the ink card).
 */
export function ProgressBar({ done, total, labelledBy, label, tone = "light" }: { done: number; total: number; labelledBy?: string; label?: string; tone?: "light" | "dark" }) {
  return (
    <div
      className={styles.bar}
      data-tone={tone}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      <span style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
    </div>
  );
}
```

  2. **Create `ProgressBar.module.css`** (the `.bar` rules move here from `EcourseView.module.css`):

```css
/* The thin progress bar (4 px): the line colour with the ink filling it; on the dark "Pooleli" card paper on a faint paper track. Tokens only. */

.bar {
  height: 4px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 99px;
  background: var(--line);
}

.bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ink);
}

.bar[data-tone="dark"] {
  background: color-mix(in srgb, var(--paper) 22%, transparent);
}

.bar[data-tone="dark"] span {
  background: var(--paper);
}
```

  3. **`EcourseView.tsx`.** Import `ProgressBar` from `./ProgressBar`. Replace the bar `<div className={styles.bar} role="progressbar" …>…</div>` with `<ProgressBar done={done} total={total} labelledBy={progressId} />`. Delete `.bar` and `.bar span` from `EcourseView.module.css`, and mention ProgressBar in its top comment.
  4. **Create `ResumeCard.tsx`:**

```tsx
"use client";

import Link from "next/link";
import { useId } from "react";
import { Icon } from "@/components/site/Icon";
import ui from "@/components/site/ui.module.css";
import type { EcourseCard, EcourseProgress } from "@/domain/account-cards";
import { pick } from "@/i18n/field";
import { fill } from "@/i18n/format";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { ProgressBar } from "./ProgressBar";
import type { CoursesTexts } from "./texts";
import styles from "./ResumeCard.module.css";

/** An e-course's progress that has a next lesson. */
export type ResumeProgress = EcourseProgress & { next: NonNullable<EcourseProgress["next"]> };

/**
 * The dark "Pooleli" card at the top of "Minu koolitused" (phase 2c, spec 4): the e-course she was busy with last (the dashboard's
 * `resume`), the next lesson as "{module} · {lesson}", the e-course page's bar with "{done} / {total} õppetundi tehtud", and the one
 * primary button, "Jätka" ("Alusta" before the first lesson is done, as on the e-course page), to that lesson. `readOnly` (the
 * admin's view): the button is there but does nothing.
 */
export function ResumeCard({ card, progress, locale, t, readOnly }: { card: EcourseCard; progress: ResumeProgress; locale: Locale; t: CoursesTexts; readOnly: boolean }) {
  const titleId = useId();
  const countId = useId();
  const { done, total, next } = progress;
  const label = (
    <>
      {done === 0 ? t.resumeBegin : t.resumeContinue}
      <Icon name="arrow" />
    </>
  );
  return (
    <article className={styles.card} aria-labelledby={titleId} data-resume-card={card.course.slug}>
      <span className={styles.tag}>{t.resumeTag}</span>
      <h2 id={titleId} className={styles.title}>
        {pick(card.course.title, locale)}
      </h2>
      <p className={styles.where} data-resume-where="">
        {fill(t.resumeWhere, { module: pick(next.moduleTitle, locale), lesson: pick(next.title, locale) })}
      </p>
      <p id={countId} className={styles.count} data-resume-progress="">
        {fill(t.resumeProgress, { done, total })}
      </p>
      <ProgressBar done={done} total={total} labelledBy={countId} tone="dark" />
      {readOnly ? (
        <a className={`${ui.btn} ${styles.action}`} role="link" aria-disabled="true" data-resume-next="">
          {label}
        </a>
      ) : (
        <Link className={`${ui.btn} ${styles.action}`} href={href(locale, `/konto/kursus/${card.course.slug}/${next.lessonId}`)} data-resume-next="">
          {label}
        </Link>
      )}
    </article>
  );
}
```

  5. **Create `ResumeCard.module.css`:**

```css
/* The "Pooleli" card (ResumeCard.tsx): the account card's box (AccountCourseCard.module.css) in ink with paper text, B .tag in a faint
   paper line, the course title in Jost, the next lesson in fog, the e-course page's thin bar (ProgressBar, dark tone) and the one
   button as a paper pill (ui.btn turned around for the dark surface). Tokens only. */

.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-top: 28px;
  padding: 28px;
  border-radius: 22px;
  background: var(--ink);
  color: var(--paper);
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 11px;
  border: 1px solid color-mix(in srgb, var(--paper) 35%, transparent);
  border-radius: 99px;
  font: 500 11px/1.3 var(--font-body);
  white-space: nowrap;
}

.title {
  margin: 16px 0 6px;
  font: 400 clamp(24px, 2.4vw, 30px) / 1.2 var(--font-display);
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.where {
  margin: 0;
  color: var(--fog);
  font: 400 15px/1.5 var(--font-body);
  overflow-wrap: anywhere;
}

.count {
  margin: 18px 0 0;
  font: 500 14px/1.5 var(--font-body);
}

.card > [role="progressbar"] {
  align-self: stretch;
  max-width: 520px;
}

.card .action {
  margin-top: 22px;
  border-color: var(--paper);
  background: var(--paper);
  color: var(--ink);
}

.card .action:hover {
  border-color: var(--first);
  background: var(--first);
}

.card .action:focus-visible {
  outline-color: var(--paper);
}

@media (max-width: 640px) {
  .card {
    padding: 24px 20px;
  }

  .card .action {
    width: 100%;
  }
}
```

  6. **`CoursesTab.tsx`.**
     - Import `ResumeCard` and `type ResumeProgress` from `./ResumeCard`, and `type EcourseCard` from `@/domain/account-cards`.
     - Before `CoursesView`, add:

```ts
/** The card and progress of the e-course the "Pooleli" card is for (the dashboard's `resume`), when it has a next lesson. */
function resumeOf(data: Dashboard): { card: EcourseCard; progress: ResumeProgress } | null {
  const card = data.resume === null ? undefined : data.cards.find((c): c is EcourseCard => c.kind === "ecourse" && c.course.slug === data.resume);
  const progress = card?.progress;
  return card && progress?.next ? { card, progress: { ...progress, next: progress.next } } : null;
}
```

     - In `CoursesView`, after `const name = …`, add `const resume = resumeOf(data);`.
     - Right after `<p className={styles.lead}>{t.lead}</p>`, add:

```tsx
          {resume && <ResumeCard card={resume.card} progress={resume.progress} locale={locale} t={t} readOnly={readOnly} />}
```

     - Extend the doc comment of `CoursesTab`: "…the greeting, the dark 'Pooleli' card of the e-course she was busy with last (phase 2c), the filter chips, …".
  7. **`AccountCourseCard.tsx`.**
     - Imports: `fill` from `@/i18n/format`, `ProgressBar` from `./ProgressBar`.
     - After `const action = step.action;`, add `const progress = card.kind === "ecourse" && !isPastCard(card, now) ? (card.progress ?? null) : null;`.
     - After the `<NextStepLine … />` line, add:

```tsx
      {progress && (
        <div className={styles.progress} data-card-progress="">
          {progress.done === progress.total ? (
            <p className={styles.finished} data-card-finished="">
              {t.finished}
            </p>
          ) : (
            <>
              <p className={styles.count} aria-hidden="true">
                {fill(t.lessonCount, { done: progress.done, total: progress.total })}
              </p>
              <ProgressBar done={progress.done} total={progress.total} label={fill(t.resumeProgress, { done: progress.done, total: progress.total })} />
            </>
          )}
        </div>
      )}
```

     - Add to the doc comment: "An open e-course with lessons shows '{done} / {total}' with the e-course page's bar, or 'Läbitud ✓' (phase 2c)."
  8. **`AccountCourseCard.module.css`.** After `.next`, add:

```css
/* an open e-course's lessons (phase 2c): "{done} / {total}" and the e-course page's thin bar, or "Läbitud ✓" */
.progress {
  align-self: stretch;
  margin-top: 14px;
}

.count {
  margin: 0;
  color: var(--ink-soft);
  font: 500 13px/1.5 var(--font-body);
}

.finished {
  margin: 0;
  color: var(--ok);
  font: 600 14px/1.5 var(--font-body);
}
```

  9. **`tests/unit/colour-tokens.test.ts`.** Add `"src/components/account/ProgressBar.module.css"` and `"src/components/account/ResumeCard.module.css"` to `COURSE_CSS`, under "the lesson's page (phase 3a Task 9)", with a comment `// the dashboard's progress (phase 2c)`.
- [ ] **Step 14: Run** `npx vitest run` — expect PASS. Then tsc and lint.
- [ ] **Step 15: E2E.** Append to `tests/e2e/account-dashboard.spec.ts`. Import `insertLessonCourse`, `markDone` and `removeLessonFile` from `./lessons`, `signInAsClient` and `clientEmail` from `./account`, and `removeClientRows` from `./fixtures` if not imported:

```ts
test("an e-course with lessons: the dark 'Pooleli' card on top with the next lesson and 'Jätka'; the card's bar; finished: 'Läbitud ✓' and no dark card", async ({ page }, info) => {
  const email = clientEmail("dash-pooleli", info.project.name);
  await removeClientRows(email);
  const c = await insertLessonCourse(email);
  try {
    await signInAsClient(page, email);
    await page.goto("/konto");
    const resume = page.locator("[data-resume-card]");
    await expect(resume).toContainText("Pooleli");
    await expect(resume.locator("[data-resume-where]")).toHaveText("Alustame · Esimene tund");
    await expect(resume.locator("[data-resume-progress]")).toHaveText("0 / 3 õppetundi tehtud");
    await expect(resume.locator("[data-resume-next]")).toHaveText("Alusta");
    await markDone(c.clientId, c.lessons.video);
    await page.reload();
    await expect(resume.locator("[data-resume-where]")).toHaveText("Alustame · Teine tund");
    await expect(resume.locator("[data-resume-next]")).toHaveText("Jätka");
    await expect(page.locator(`[data-card="course-${c.slug}"] [data-card-progress]`)).toHaveText("1 / 3");
    expect(await noOverflow(page)).toBe(true);
    await resume.locator("[data-resume-next]").click();
    await expect(page).toHaveURL(new RegExp(`/konto/kursus/${c.slug}/${c.lessons.text}$`));
    await markDone(c.clientId, c.lessons.text);
    await markDone(c.clientId, c.lessons.last);
    await page.goto("/konto");
    await expect(page.locator(`[data-card="course-${c.slug}"] [data-card-finished]`)).toHaveText("Läbitud ✓");
    await expect(page.locator("[data-resume-card]")).toHaveCount(0);
  } finally {
    await removeClientRows(email);
    await removeLessonFile(c.fileKey);
  }
});
```

     (`markDone` inserts a done row; a lesson she has a row for already would conflict: the test marks each lesson once, and the lesson page it opens is a text lesson, which writes no row.)
- [ ] **Step 16: Run** `npx playwright test account-dashboard account-ecourse account-lessons admin-clients` (dev), and `E2E_PROD_BUILD=1 npx playwright test account-dashboard`. Then `npm run visual` is not needed: the account pages are not in it. Instead, check the dashboard by hand at 390 and 1440, or with the e2e test's `noOverflow`.
- [ ] **Step 17: Commit.**

```bash
git add app/src/domain/account-cards.ts app/src/server/lesson-outline.ts app/src/server/client-data.ts app/src/components/account app/src/i18n/dict/et.ts app/src/i18n/dict/ru.ts app/tests
git commit -m "feat(account): the 'Pooleli' card and the e-course cards' progress on Minu koolitused

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: The newsletter popup on the home page

Spec section 5 (Popup).
- The home page shows the one active popup row: the campaign card as today, or the newsletter card.
- The newsletter card shows the admin's picture and texts and a form: e-mail, the footer's consent, "Liitu". It posts to the existing `subscribe` action, with its honeypot, rate limits and 3 confirmation mails per address a day.
- Success says "Saatsime sulle kinnituslingi. Ava see oma postkastis." inside the popup.
- After a sign-up this browser remembers it (`localStorage` `mslab-nl`, wrapped in try/catch) and never shows the newsletter popup again.
- The timing is the campaign's: 6 s, once per browser session.
- The admin's switch comes in Task 8: here the row is switched on by SQL.
- To share the dialog and the form without copying them, the campaign popup's timing and dialog move to `PopupDialog.tsx`, and the footer's form moves to `NewsletterForm.tsx`. Both keep their behaviour and their `data-*` names, so `campaign.spec.ts` and `forms.spec.ts` stay as they are.

**Files:**
- Modify: `app/src/db/queries/public.ts` (`HomeData.popup`), `app/src/domain/campaign.ts`
- Create: `app/src/components/site/PopupDialog.tsx`, `NewsletterForm.tsx`, `NewsletterPopupCard.tsx`, `NewsletterPopup.tsx`
- Modify: `app/src/components/site/CampaignPopup.tsx`, `Newsletter.tsx`, `CampaignCard.module.css` (`.signup`)
- Modify: `app/src/app/[locale]/(site)/page.tsx`, `app/src/i18n/dict/et.ts`, `ru.ts` (`newsletter.popupSent`)
- Test: `app/tests/unit/campaign.test.ts`, `app/tests/db/queries.test.ts`, `app/tests/db/seed.test.ts`, `app/tests/db/admin-site.test.ts`, `app/tests/e2e/admin-site.spec.ts` (a new describe: it changes the popup rows, so it runs in the late edit projects)

**Interfaces:**
- Consumes: `campaign.kind`, `POPUP_ID` (Task 1).
- Produces, from `src/db/queries/public.ts`: `HomeData.popup: Campaign | null` — the active row of either kind. It replaces `HomeData.campaign`.
- Produces, from `src/domain/campaign.ts`:
  - `type NewsletterPopupView = { image: string; kicker: string; title: string; text: string }`;
  - `newsletterPopupView(c: Campaign | null | undefined, locale: Locale): NewsletterPopupView | null`;
  - `const NEWSLETTER_SIGNED_KEY = "mslab-nl"`;
  - `campaignView` now answers null for a row that is not of kind `campaign`.
- Produces, as components:
  - `usePopupOpen(image: string, skip?: () => boolean): [boolean, () => void]` and `PopupDialog({ name, titleId, closeLabel, status?, onClose, children })` (`children: (close: ReactNode) => ReactNode`);
  - `NewsletterForm({ locale, t, onSent?, preview? })` with `NewsletterFormTexts` (`preview`: the admin's picture of it, Task 8 — no `<form>` element, no honeypot, a button that submits nothing);
  - `NewsletterPopupCard({ n, titleId?, close?, form })`;
  - `NewsletterPopup({ n, locale, t })` with `NewsletterPopupTexts = { close: string; form: NewsletterFormTexts }`.
- Produces, in the dictionaries: `newsletter.popupSent`.

- [ ] **Step 1: Write the failing tests.**
  1. **`tests/unit/campaign.test.ts`.** Import `newsletterPopupView` and `NEWSLETTER_SIGNED_KEY`. Append:

```ts
describe("the newsletter popup (phase 2c)", () => {
  const nl = (over: Partial<Campaign> = {}): Campaign => ({ ...row(), id: 2, kind: "newsletter", code: "", ctaLabel: { et: "" }, ctaHref: "", ...over });

  test("its card: the picture, kicker, title and text in the page's language (no code, no button)", () => {
    expect(newsletterPopupView(nl({ kicker: { et: "MS LABi kirjad", ru: "Письма MS LAB" }, title: { et: "Hea järgmine samm.", ru: "Ваш следующий шаг." }, text: { et: "Tekst" } }), "ru")).toEqual({
      image: "/media/img/0b6f3b7e-2c4d-4f7a-9a59-3d7c2f1e8a10.jpg",
      kicker: "Письма MS LAB",
      title: "Ваш следующий шаг.",
      text: "Tekst",
    });
  });

  test("none for a switched-off row, a missing one, one without a title, or the campaign's row; and the campaign card is never the newsletter's", () => {
    expect(newsletterPopupView(nl({ active: false }), "et")).toBeNull();
    expect(newsletterPopupView(null, "et")).toBeNull();
    expect(newsletterPopupView(nl({ title: { et: " " } }), "et")).toBeNull();
    expect(newsletterPopupView(row(), "et")).toBeNull();
    expect(campaignView(nl(), "et", et.campaign.cta)).toBeNull();
  });

  test("a sign-up from the popup is remembered under its own key", () => {
    expect(NEWSLETTER_SIGNED_KEY).toBe("mslab-nl");
  });
});
```

     (`row()` is the file's campaign fixture; import `type Campaign` from `@/db/schema` if missing.)
  2. **`tests/db/queries.test.ts`.** In the home-data test, `expect(home.campaign).toBeNull();` becomes `expect(home.popup).toBeNull();`, and `expect((await getHomeData(db)).campaign?.ctaLabel.et).toBe("Leia enda koolitus");` becomes `expect((await getHomeData(db)).popup).toMatchObject({ kind: "campaign", ctaLabel: { et: "Leia enda koolitus" } });`. Then add, at the end of that test:

```ts
    // the newsletter row shown instead (at most one active): the home page gets that one
    await db.update(campaign).set({ active: false }).where(eq(campaign.id, 1));
    await db.update(campaign).set({ active: true }).where(eq(campaign.id, 2));
    expect((await getHomeData(db)).popup).toMatchObject({ id: 2, kind: "newsletter" });
```

     (Import `campaign` from `@/db/schema` and `eq` from `drizzle-orm` if missing.)
  3. **`tests/db/seed.test.ts`:** `expect(home.campaign?.ctaLabel.et).toBe("Leia enda koolitus");` becomes `expect(home.popup).toMatchObject({ kind: "campaign", ctaLabel: { et: "Leia enda koolitus" } });`.
  4. **`tests/db/admin-site.test.ts`:** `expect((await getHomeData(db)).campaign).toBeNull();` becomes `expect((await getHomeData(db)).popup).toBeNull();`.
- [ ] **Step 2: Run them — expect FAIL**: `newsletterPopupView` and `popup` do not exist.
- [ ] **Step 3: The data and the domain.**
  1. **`src/db/queries/public.ts`.** In `HomeData`, replace `campaign: Campaign | null;` with:

```ts
  /** The popup the home page shows: the one active `campaign` row, of either kind (phase 2c); null when every popup is off. */
  popup: Campaign | null;
```

     In `getHomeData`, the campaign query becomes `db.select().from(campaign).where(eq(campaign.active, true)).limit(1),` (rename its variable to `popupRow`), and the result's last line becomes `popup: popupRow[0] ?? null,`. Change the doc comment's "The campaign is null when it is switched off." to "The popup is the active one of the campaign and the newsletter popup, or null."
  2. **`src/domain/campaign.ts`.**
     - In `campaignView`, the first line becomes `if (!c?.active || c.kind !== "campaign") return null;`.
     - Its doc comment adds "…or a row of another kind (the newsletter popup: newsletterPopupView)".
     - Append:

```ts
/** What the newsletter popup's card shows (components/site/NewsletterPopupCard), in the page's language (phase 2c). */
export type NewsletterPopupView = { image: string; kicker: string; title: string; text: string };

/** localStorage key, set after a sign-up from the newsletter popup: this browser never sees that popup again (spec 5). */
export const NEWSLETTER_SIGNED_KEY = "mslab-nl";

/**
 * The newsletter popup's card for the home page (phase 2c), or null: no row, a switched-off one, another kind (the campaign: campaignView)
 * or one without a title (the dialog is named by its title). The welcome code is never in it: it comes after the confirmation.
 */
export function newsletterPopupView(c: Campaign | null | undefined, locale: Locale): NewsletterPopupView | null {
  if (!c?.active || c.kind !== "newsletter") return null;
  const title = pick(c.title, locale).trim();
  if (!title) return null;
  return { image: mediaUrl(c.imageKey), kicker: pick(c.kicker, locale), title, text: pick(c.text, locale) };
}
```

- [ ] **Step 4: Run** the unit and DB tests of step 1 — expect PASS. (`page.tsx` does not compile yet: step 7.)
- [ ] **Step 5: The shared dialog.**
  1. **Create `src/components/site/PopupDialog.tsx`.**
     - The timing of `CampaignPopup` moves into `usePopupOpen`. Keep it exactly, and add `skip`.
     - The dialog of `CampaignDialog` moves into `PopupDialog`. The card and the copy button stay in `CampaignPopup.tsx`.

```tsx
"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CAMPAIGN_SEEN_KEY, campaignDelay } from "@/domain/campaign";
import { lockPageScroll, trapTab } from "@/lib/modal";
import { Icon } from "./Icon";
import modal from "@/components/ui/modal.module.css";
import ui from "./ui.module.css";
import styles from "./CampaignPopup.module.css";

declare global {
  interface Window {
    /** e2e only (tests/e2e/test.ts): a shorter delay than D's 6 s, in ms. */
    __mslabCampaignDelay?: number;
  }
}

/** How far a finger pulls the sheet down before letting go closes it. */
const SWIPE_CLOSE_PX = 80;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A popup was shown during this page load already. The module lives as long as the document, through client-side moves (home →
 * course → home remounts the popup), so this keeps "once" when sessionStorage is refused; a new page load starts over.
 */
let shownThisLoad = false;

const NEVER = () => false;

/**
 * When the home page's popup opens (prototype D `maybeAutoCampaign`; the campaign, and from phase 2c the newsletter popup): 6 s after
 * the page appears, once per browser session (sessionStorage "mslab-camp", set when it is shown; without storage at most once per
 * page load, also across client-side moves back home). It waits while another modal (the phone menu, a lightbox) is open, and fetches
 * `image` meanwhile. `skip()` true: this browser does not get it at all (the newsletter popup after a sign-up from it). [open, close].
 */
export function usePopupOpen(image: string, skip: () => boolean = NEVER): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (shownThisLoad || skip()) return;
    try {
      if (sessionStorage.getItem(CAMPAIGN_SEEN_KEY) === "1") return;
    } catch {
      // no storage: this page load may still show it once
    }
    // Fetch the picture while waiting, so the card opens with it.
    if (image) new Image().src = image;
    let timer = window.setTimeout(function show() {
      if (document.querySelector("dialog[open]")) {
        timer = window.setTimeout(show, 1000);
        return;
      }
      shownThisLoad = true;
      try {
        sessionStorage.setItem(CAMPAIGN_SEEN_KEY, "1");
      } catch {
        // shown anyway: shownThisLoad keeps it to once for this page load
      }
      setOpen(true);
    }, campaignDelay(window.__mslabCampaignDelay));
    return () => window.clearTimeout(timer);
  }, [image, skip]);
  const close = useCallback(() => setOpen(false), []);
  return [open, close];
}

/**
 * The open popup: a modal <dialog> over a dimmed, blurred page (D .camp-bd) holding the card that `children` draws, with ✕ handed to
 * it for its corner. No "Mitte praegu" (M3). Focus moves to ✕, Tab stays inside, the page behind does not scroll; Esc, ✕ and the
 * backdrop close it and give the focus back; a link inside closes it on its way (the focus belongs to the next page then). Under
 * 640px it is D's bottom sheet, which also closes when pulled down; with reduced motion nothing slides. `name` marks its parts for
 * the tests (data-<name>-popup, -backdrop, -panel, -close); `status` is read out (role=status).
 */
export function PopupDialog({
  name,
  titleId,
  closeLabel,
  status = "",
  onClose,
  children,
}: {
  name: "campaign" | "newsletter";
  titleId: string;
  closeLabel: string;
  status?: string;
  onClose: () => void;
  children: (close: ReactNode) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(true);
  const mark = (part: string) => ({ [`data-${name}-${part}`]: "" });

  // Open as a modal, lock the page, focus ✕; on close unlock and give the focus back.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const unlock = lockPageScroll();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>(`[data-${name}-close]`)?.focus();
    // D: the backdrop fades in and the card rises (CSS transitions from the closed state; none with reduced motion)
    const frame = requestAnimationFrame(() => dialog.setAttribute("data-on", ""));
    return () => {
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
      unlock();
      if (returnFocus.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [name]);

  // A downward swipe on the sheet closes it: the sheet follows the finger (not with reduced motion) and closes when let go far
  // enough down, otherwise it springs back. Only from the top of the sheet's own scroll and only downwards, so scrolling a tall card
  // still works. A non-passive listener, so the page does not scroll (or refresh) meanwhile.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let dy = 0;
    const reset = () => {
      panel.removeAttribute("data-dragging");
      panel.style.transform = "";
    };
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 && panel.scrollTop <= 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      dragging = false;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const ddx = e.touches[0].clientX - start.x;
      const ddy = e.touches[0].clientY - start.y;
      if (!dragging) {
        if (ddy <= 0 || Math.abs(ddx) > ddy) {
          start = null; // up or sideways: the card's own scrolling
          return;
        }
        dragging = true;
        panel.setAttribute("data-dragging", "");
      }
      if (e.cancelable) e.preventDefault();
      dy = Math.max(0, ddy);
      if (!reducedMotion()) panel.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      const wasDragging = dragging;
      start = null;
      dragging = false;
      if (!wasDragging) return;
      if (e.type === "touchend" && dy >= SWIPE_CLOSE_PX) onClose();
      else reset();
    };
    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={modal.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      {...mark("popup")}
      onKeyDown={(e) => trapTab(e, ref.current)} // Tab stays inside
      // Esc fires "cancel": closing goes through onClose, so the popup's state stays the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Closed by the browser itself: follow. The event comes a moment later, so a dialog opened again meanwhile (React's
      // development re-run of the effect) is not closed by an old close.
      onClose={(e) => {
        if (!e.currentTarget.open) onClose();
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.hasAttribute(`data-${name}-backdrop`)) onClose();
        else if (target.closest("a[href]")) {
          // A ctrl/cmd-, shift- or alt-click (or any but the main button) opens the link elsewhere: this page stays, and so do the
          // popup and its focus.
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          // on to the link: the focus belongs to the next page, not back to this one
          returnFocus.current = false;
          onClose();
        }
      }}
    >
      <div className={modal.backdrop} {...mark("backdrop")} aria-hidden="true" />
      <div ref={panelRef} className={`${modal.panel} ${styles.panel}`} {...mark("panel")} data-fab-avoid="">
        {children(
          <button type="button" className={`${modal.close} ${styles.close}`} aria-label={closeLabel} onClick={onClose} {...mark("close")}>
            <Icon name="close" size={20} />
          </button>,
        )}
      </div>
      <p className={ui.srOnly} role="status">
        {status}
      </p>
    </dialog>
  );
}
```

  2. **Replace `CampaignPopup.tsx`** with:

```tsx
"use client";

import { useId, useState } from "react";
import type { CampaignView } from "@/domain/campaign";
import type { Locale } from "@/i18n/locales";
import { CampaignCard } from "./CampaignCard";
import { PopupDialog, usePopupOpen } from "./PopupDialog";

export type CampaignPopupTexts = { close: string; copy: string; copied: string; selected: string };

/**
 * The campaign popup (prototype D `campHtml` / `maybeAutoCampaign`, Maria C37: "Sellise kampaania lahendus mulle meeldib"). Rendered by
 * the home page only (/ and /ru), when the campaign is the popup shown. Its timing and dialog are PopupDialog's (6 s, once per browser
 * session); here are the card and the copy button by the code.
 */
export function CampaignPopup({ c, locale, t }: { c: CampaignView; locale: Locale; t: CampaignPopupTexts }) {
  const [open, close] = usePopupOpen(c.image);
  return open ? <CampaignDialog c={c} locale={locale} t={t} onClose={close} /> : null;
}

function CampaignDialog({ c, locale, t, onClose }: { c: CampaignView; locale: Locale; t: CampaignPopupTexts; onClose: () => void }) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(c.code);
      setCopied(true);
      setStatus(t.copied);
    } catch {
      // No clipboard (an old browser, an insecure page, a refusal): select the code for the visitor to copy.
      const code = document.querySelector("[data-campaign-popup] [data-campaign-code]");
      const selection = window.getSelection();
      if (code && selection) selection.selectAllChildren(code);
      setStatus(t.selected);
    }
  };

  return (
    <PopupDialog name="campaign" titleId={titleId} closeLabel={t.close} status={status} onClose={onClose}>
      {(close) => (
        <CampaignCard
          c={c}
          locale={locale}
          titleId={titleId}
          close={close}
          codeAction={
            <button type="button" onClick={copy} data-campaign-copy="">
              {copied ? t.copied : t.copy}
            </button>
          }
        />
      )}
    </PopupDialog>
  );
}
```

- [ ] **Step 6: The form and the newsletter popup.**
  1. **Create `src/components/site/NewsletterForm.tsx`.** The form part of `Newsletter.tsx` moves here unchanged, plus `onSent` and `preview`. `preview` is the admin's picture of the form (Task 8): Hüpikaken's editor is a `<form>` itself, and a form inside a form is dropped by the browser's parser, so the server's HTML and React's tree would differ and the admin page would fail to hydrate; the picture has no honeypot either (its input, off-screen but laid out, would fail the admin's 44 px check in `admin-site.spec.ts`):

```tsx
"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";
import { subscribe } from "@/server/actions/public";
import { Icon } from "./Icon";
import styles from "./Newsletter.module.css";

export type NewsletterFormTexts = {
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  consent: string;
  /** Above the sent text; "" for none. */
  sentTitle: string;
  sentText: string;
  errorEmail: string;
  errorRequired: string;
  errorTooMany: string;
  errorGeneric: string;
};

type Field = "email" | "consent" | "form";
type State = { status: "idle" } | { status: "sent" } | { status: "error"; field: Field; message: string };

/**
 * The newsletter's sign-up form, double opt-in: the subscribe action stores the address and mails the confirmation link, and the
 * answer is always "check your inbox". The e-mail, "Liitu" and the consent, under each other. The footer's lilac card (Newsletter)
 * and the home page's newsletter popup (NewsletterPopup) both use it. `onSent`: told once, when the address was taken (the popup
 * remembers the sign-up). Submitted by hand (onSubmit + startTransition), as the other forms: React resets a form after
 * `<form action>`, which would un-tick the controlled consent box after a failed attempt. The status region is always in the page
 * (polite), so the confirmation is announced; focus moves to it because the form it replaces had focus. `preview`: a picture of the form
 * for the admin's Hüpikaken (Task 8), which sits inside the editor's own form: the same fields in a plain block (a form never nests in
 * a form), no honeypot, and a button that submits nothing.
 */
export function NewsletterForm({ locale, t, onSent, preview = false }: { locale: Locale; t: NewsletterFormTexts; onSent?: () => void; preview?: boolean }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const sentTold = useRef(onSent);
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    try {
      const result = await subscribe(formData);
      if (result.ok) return { status: "sent" };
      const { errors } = result;
      if (errors.email) return { status: "error", field: "email", message: t.errorEmail };
      if (errors.consent) return { status: "error", field: "consent", message: t.errorRequired };
      return { status: "error", field: "form", message: errors.form === "rate" ? t.errorTooMany : t.errorGeneric };
    } catch {
      return { status: "error", field: "form", message: t.errorGeneric };
    }
  }, { status: "idle" });

  useEffect(() => {
    sentTold.current = onSent;
  });

  useEffect(() => {
    if (state.status === "sent") {
      statusRef.current?.focus();
      sentTold.current?.();
    } else if (state.status === "error") document.getElementById(`${id}-${state.field}`)?.focus();
  }, [state, id]);

  const error = state.status === "error" ? state : null;
  const describe = (f: Field) => (error?.field === f ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {});

  const fields = (
    <>
      <label className={styles.label} htmlFor={`${id}-email`}>
        {t.emailLabel}
      </label>
      <div className={styles.row}>
        <input
          id={`${id}-email`}
          className={styles.input}
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={200}
          placeholder={t.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...describe("email")}
        />
        {/* aria-disabled, not disabled: a disabled button would drop keyboard focus to the page while sending. */}
        {/* data-fab-avoid: the review build's comment button moves up instead of covering it (N4) */}
        <button className={styles.submit} type={preview ? "button" : "submit"} aria-disabled={pending || undefined} data-fab-avoid="">
          {t.submit}
          <Icon name="arrow" />
        </button>
      </div>
      <label className={styles.check}>
        <input id={`${id}-consent`} type="checkbox" name="consent" required checked={consent} onChange={(e) => setConsent(e.target.checked)} {...describe("consent")} />
        <span>{t.consent}</span>
      </label>
      <input type="hidden" name="locale" value={locale} />
      {/* Honeypot: people never see or fill it (the admin's picture has none). */}
      {!preview && (
        <div className={styles.honeypot} aria-hidden="true">
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
      )}
      {error && (
        <p id={error.field === "form" ? `${id}-form` : `${id}-error`} className={styles.error} role="alert" tabIndex={error.field === "form" ? -1 : undefined}>
          {error.message}
        </p>
      )}
    </>
  );

  return (
    <div className={styles.form}>
      <div ref={statusRef} className={styles.status} role="status" tabIndex={-1} data-newsletter-status="">
        {state.status === "sent" && (
          <>
            {t.sentTitle && <h3 className={styles.sentTitle}>{t.sentTitle}</h3>}
            <p className={styles.text}>{t.sentText}</p>
          </>
        )}
      </div>
      {state.status !== "sent" &&
        (preview ? (
          <div data-newsletter-form="">{fields}</div>
        ) : (
          <form
            method="post"
            noValidate
            data-newsletter-form=""
            onSubmit={(e) => {
              e.preventDefault();
              if (pending) return;
              const formData = new FormData(e.currentTarget);
              startTransition(() => formAction(formData));
            }}
          >
            {fields}
          </form>
        ))}
    </div>
  );
}
```

  2. **`Newsletter.tsx`.** It keeps the card and uses the form:

```tsx
"use client";

import { useId } from "react";
import type { Locale } from "@/i18n/locales";
import { NewsletterForm, type NewsletterFormTexts } from "./NewsletterForm";
import styles from "./Newsletter.module.css";

export type NewsletterTexts = NewsletterFormTexts & { eyebrow: string; titleFirst: string; titleSecond: string; body: string };

/** B newsletter block ("MS LABi kirjad"), the lilac card in the footer's right column (H13; phase 2c): its words and the sign-up form (NewsletterForm). */
export function Newsletter({ locale, t }: { locale: Locale; t: NewsletterTexts }) {
  const id = useId();
  return (
    <section className={styles.newsletter} aria-labelledby={`${id}-title`} data-footer-newsletter="">
      <div>
        <p className={styles.eyebrow}>{t.eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.title}>
          {t.titleFirst}
          <br />
          {t.titleSecond}
        </h2>
        <p className={styles.text}>{t.body}</p>
      </div>
      <NewsletterForm locale={locale} t={t} />
    </section>
  );
}
```

  3. **Create `src/components/site/NewsletterPopupCard.tsx`:**

```tsx
import type { ReactNode } from "react";
import type { NewsletterPopupView } from "@/domain/campaign";
import { keepNamesTogether } from "@/lib/typography";
import ui from "./ui.module.css";
import styles from "./CampaignCard.module.css";

/**
 * The newsletter popup's card (phase 2c): the campaign card's picture, kicker, Jost title and text (CampaignCard.module.css), with the
 * sign-up form in place of the code and the button. Presentational only: the dialog is the popup's (NewsletterPopup), and `form` is
 * given — the real NewsletterForm on the home page, the same form inert in the admin's preview.
 */
export function NewsletterPopupCard({ n, titleId, close, form }: { n: NewsletterPopupView; titleId?: string; close?: ReactNode; form: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.camp} data-newsletter-card="">
        {close}
        <div className={styles.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an upload already resized in the browser (ImageUpload) and served by /media, as CampaignCard */}
          {n.image && <img className={styles.image} src={n.image} alt="" />}
        </div>
        <div className={styles.body}>
          {n.kicker && <p className={`${ui.caps} ${styles.kicker}`}>{n.kicker}</p>}
          <h2 id={titleId} className={styles.title}>
            {keepNamesTogether(n.title)}
          </h2>
          {n.text && <p className={styles.text}>{n.text}</p>}
          <div className={styles.signup}>{form}</div>
        </div>
      </div>
    </div>
  );
}
```

     In `CampaignCard.module.css`, after `.actions`, add:

```css
/* the newsletter popup's form in place of the code and the button (NewsletterPopupCard, phase 2c) */
.signup {
  margin-top: 18px;
}
```

  4. **Create `src/components/site/NewsletterPopup.tsx`:**

```tsx
"use client";

import { useId } from "react";
import { NEWSLETTER_SIGNED_KEY, type NewsletterPopupView } from "@/domain/campaign";
import type { Locale } from "@/i18n/locales";
import { NewsletterForm, type NewsletterFormTexts } from "./NewsletterForm";
import { NewsletterPopupCard } from "./NewsletterPopupCard";
import { PopupDialog, usePopupOpen } from "./PopupDialog";

export type NewsletterPopupTexts = { close: string; form: NewsletterFormTexts };

/** Signed up from this browser's newsletter popup (localStorage "mslab-nl"): it is never shown here again. */
function signedUpHere(): boolean {
  try {
    return localStorage.getItem(NEWSLETTER_SIGNED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSignUp(): void {
  try {
    localStorage.setItem(NEWSLETTER_SIGNED_KEY, "1");
  } catch {
    // blocked storage: the once-per-session rule still holds
  }
}

/**
 * The newsletter popup (phase 2c, spec 5): on the home page only, when it is the popup the admin shows, with the campaign popup's timing
 * and dialog (PopupDialog: 6 s, once per browser session), the admin's picture and texts, and the footer's sign-up form (e-mail,
 * consent, "Liitu": the subscribe action, its honeypot and limits). After a sign-up "Saatsime sulle kinnituslingi. Ava see oma
 * postkastis." takes the form's place, and this browser never sees the popup again. The welcome code is never here: it comes after
 * the confirmation (the welcome mail and the confirmed page).
 */
export function NewsletterPopup({ n, locale, t }: { n: NewsletterPopupView; locale: Locale; t: NewsletterPopupTexts }) {
  const [open, close] = usePopupOpen(n.image, signedUpHere);
  return open ? <NewsletterDialog n={n} locale={locale} t={t} onClose={close} /> : null;
}

function NewsletterDialog({ n, locale, t, onClose }: { n: NewsletterPopupView; locale: Locale; t: NewsletterPopupTexts; onClose: () => void }) {
  const titleId = useId();
  return (
    <PopupDialog name="newsletter" titleId={titleId} closeLabel={t.close} onClose={onClose}>
      {(close) => <NewsletterPopupCard n={n} titleId={titleId} close={close} form={<NewsletterForm locale={locale} t={t.form} onSent={rememberSignUp} />} />}
    </PopupDialog>
  );
}
```

- [ ] **Step 7: The home page and the dictionaries.**
  1. **Dictionaries**, in `newsletter` after `sentTitle`:
     - `et.ts`: `popupSent: "Saatsime sulle kinnituslingi. Ava see oma postkastis.",`, with the comment `// the newsletter popup's answer after a sign-up (components/site/NewsletterPopup.tsx, phase 2c)`;
     - `ru.ts`: `popupSent: "Мы отправили вам ссылку для подтверждения. Откройте её в своём почтовом ящике.",`.
  2. **`app/[locale]/(site)/page.tsx`.**
     - Import `NewsletterPopup` and `newsletterPopupView`.
     - Replace `const campaign = campaignView(home.campaign, locale, d.campaign.cta);` and its comment with:

```tsx
  // The home page's popup (Task 14; phase 2c): the one the admin shows, the campaign or the newsletter sign-up; none when off.
  const campaign = campaignView(home.popup, locale, d.campaign.cta);
  const newsletterPopup = newsletterPopupView(home.popup, locale);
```

     - After the `CampaignPopup` element, add:

```tsx
      {newsletterPopup && (
        <NewsletterPopup
          n={newsletterPopup}
          locale={locale}
          t={{
            close: d.common.close,
            form: {
              emailLabel: d.newsletter.emailLabel,
              emailPlaceholder: d.newsletter.emailPlaceholder,
              submit: d.newsletter.submit,
              consent: d.newsletter.consent,
              sentTitle: "",
              sentText: d.newsletter.popupSent,
              errorEmail: d.forms.errorEmail,
              errorRequired: d.forms.errorRequired,
              errorTooMany: d.forms.errorTooMany,
              errorGeneric: d.forms.errorGeneric,
            },
          }}
        />
      )}
```

- [ ] **Step 8: Run** `npx vitest run`, tsc, lint — green.
- [ ] **Step 9: E2E.** In `tests/e2e/admin-site.spec.ts`, after the "campaign (M2–M5)" describe, add a describe that switches the popup rows by SQL. The admin's switch is Task 8. Import `storedSubscriber` and `testEmail` from `./fixtures` if missing:

```ts
test.describe("the newsletter popup (phase 2c)", () => {
  test.use({ campaignPopup: 300 });

  /** The newsletter popup shown instead of the campaign (at most one active: the campaign first goes off). */
  const showNewsletter = () =>
    onLocalDb(async (sql) => {
      await sql`update campaign set active = false where id = 1`;
      await sql`update campaign set active = true where id = 2`;
    });

  test("it opens on the home page with its texts and the form; a sign-up says so inside and is never shown again in this browser", async ({ page }, info) => {
    test.skip(phone(info), "one popup row: desktop changes it");
    await changing(["campaign"]);
    await showNewsletter();
    await page.goto("/");
    const popup = page.getByRole("dialog", { name: "Hea järgmine samm. Otse sinu postkasti." });
    await expect(popup).toBeVisible();
    await expect(popup.locator("[data-newsletter-card] img")).toHaveAttribute("src", "/seed/gift-bag-serum.jpg");
    await expect(popup.getByText("MS LABi kirjad")).toBeVisible();
    await expect(popup.locator("[data-campaign-code]")).toHaveCount(0); // no code in the popup: it comes after the confirmation
    const addr = testEmail("nl-popup", info.project.name);
    await popup.getByLabel("Sinu e-post").fill(addr);
    await popup.getByRole("checkbox").check();
    await popup.getByRole("button", { name: "Liitu" }).click();
    await expect(popup.locator("[data-newsletter-status]")).toHaveText("Saatsime sulle kinnituslingi. Ava see oma postkastis.");
    expect(await storedSubscriber(addr)).toMatchObject({ email: addr, confirmed: false });
    expect(await page.evaluate(() => localStorage.getItem("mslab-nl"))).toBe("1");
    await page.keyboard.press("Escape");
    await page.evaluate(() => sessionStorage.removeItem("mslab-camp")); // a new browser session …
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(page.getByRole("dialog")).toHaveCount(0); // … still none: signed up here
  });

  test("Russian, at a phone's width: the sheet with the form fits (no overflow, 44 px targets); the campaign is not shown meanwhile; switched off, none", async ({ page }, info) => {
    test.skip(phone(info), "one popup row: desktop changes it (and sets the phone's width here)");
    await changing(["campaign"]);
    await showNewsletter();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ru");
    const popup = page.getByRole("dialog", { name: "Ваш следующий шаг. В вашем почтовом ящике." });
    await expect(popup).toBeVisible();
    const submit = popup.getByRole("button", { name: "Подписаться" });
    await expect(submit).toBeVisible();
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("dialog", { name: "−15% на курс Lash Lift BOTOX" })).toHaveCount(0);
    await onLocalDb((sql) => sql`update campaign set active = false`);
    await page.evaluate(() => sessionStorage.removeItem("mslab-camp"));
    await page.goto("/");
    await page.waitForTimeout(1200);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
```

     - The sign-up stores a subscriber row for an `e2e-form-…@example.com` address. `removeFormRows` already deletes those in the global setup and teardown, so nothing stays behind.
     - Only the desktop edit project switches the popup rows. The two edit projects run side by side, so the Russian test sets a phone's width itself rather than run in the phone project.
- [ ] **Step 10: Run** `npx playwright test campaign admin-site home forms` (dev) and `E2E_PROD_BUILD=1 npx playwright test campaign admin-site` — green.
- [ ] **Step 11: Commit.**

```bash
git add app/src/db/queries/public.ts app/src/domain/campaign.ts app/src/components/site "app/src/app/[locale]/(site)/page.tsx" app/src/i18n/dict/et.ts app/src/i18n/dict/ru.ts app/tests
git commit -m "feat(newsletter): the newsletter popup on the home page; the popups share their dialog, the footer and popup their form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin "Hüpikaken" — what the home page shows, and the newsletter popup's texts

Spec section 5 (Admin).
- The "Kampaania" page is renamed "Hüpikaken".
- A choice at the top, "Lehel näidatakse": Kampaania / Uudiskiri / Väljas. Saving sets the `active` flags in one transaction.
- Two editors, each with its live ET/RU preview: Kampaania (unchanged fields) and Uudiskiri (kicker, title, text, picture).

**Files:**
- Modify: `app/src/domain/campaign.ts`, `app/src/domain/site-editor.ts`
- Modify: `app/src/db/queries/admin-site.ts`, `app/src/db/queries/admin.ts`
- Modify: `app/src/server/admin-site.ts`, `app/src/components/admin/CampaignEditor.tsx`, `app/src/app/admin/(panel)/kampaania/page.tsx` (comment only)
- Modify: `app/src/i18n/dict/admin.ts`
- Test: `app/tests/unit/campaign.test.ts`, `app/tests/unit/admin.test.ts` (the menu's label), `app/tests/db/admin-site.test.ts`, `app/tests/db/queries.test.ts`
- E2E: `app/tests/e2e/admin-site.spec.ts`, `app/tests/e2e/admin-inbox.spec.ts`

**Interfaces:**
- Consumes: `PopupKind`, `POPUP_ID` (Task 1); `NewsletterPopupCard`, `NewsletterForm` (Task 7).
- Produces, from `src/domain/campaign.ts`:
  - `type PopupChoice = PopupKind | "off"`;
  - `popupShown(campaignActive: boolean, newsletterActive: boolean): PopupChoice`;
  - `popupFlags(choice: PopupChoice): Record<PopupKind, boolean>`.
- Produces, from `src/domain/site-editor.ts`:
  - `type NewsletterPopupDraft = { active: boolean; kicker: I18n; title: I18n; text: I18n; imageKey: string }`;
  - `newsletterPopupDraft(c: Campaign | null): NewsletterPopupDraft`.
- Produces, from `src/db/queries/admin-site.ts`: `readCampaign(q)` (the `campaign` kind's row) and `readNewsletterPopup(q)` (the `newsletter` kind's row).
- Produces, from `src/db/queries/admin.ts`:
  - `upsertCampaign(db: Q, input: CampaignInput, kind?: PopupKind): Promise<Campaign>`;
  - `CampaignInput = Omit<Insert<typeof campaign>, "id" | "kind">`;
  - switching a row on switches the other off first.
- Produces, from `src/server/admin-site.ts`: `loadCampaign` answers `{ campaign: CampaignDraft; newsletter: NewsletterPopupDraft }`; `saveCampaignForm` takes either part or both.

- [ ] **Step 1: Write the failing tests.**
  1. **`tests/unit/campaign.test.ts`.** Import `popupFlags` and `popupShown`, and append:

```ts
describe("Lehel näidatakse: one popup or none (phase 2c)", () => {
  test("the choice from the two rows' flags (both on cannot be stored; the campaign wins if it ever were)", () => {
    expect(popupShown(true, false)).toBe("campaign");
    expect(popupShown(false, true)).toBe("newsletter");
    expect(popupShown(false, false)).toBe("off");
    expect(popupShown(true, true)).toBe("campaign");
  });

  test("the flags for a choice: at most one on", () => {
    expect(popupFlags("campaign")).toEqual({ campaign: true, newsletter: false });
    expect(popupFlags("newsletter")).toEqual({ campaign: false, newsletter: true });
    expect(popupFlags("off")).toEqual({ campaign: false, newsletter: false });
  });
});
```

  2. **`tests/db/admin-site.test.ts`.** In the describe "campaign (D adminCamp + image upload, M3–M5)", add (import `campaign` and `asc` if missing):

```ts
  test("Hüpikaken: both parts load; choosing Uudiskiri switches the campaign off and the newsletter on in one save; Väljas both off", async () => {
    const p = await loadCampaign(db);
    expect(p.values.newsletter).toMatchObject({ active: false, kicker: { et: "MS LABi kirjad", ru: "Письма MS LAB" }, imageKey: "/seed/gift-bag-serum.jpg" });
    const flags = async () => (await db.select({ id: campaign.id, active: campaign.active }).from(campaign).orderBy(asc(campaign.id))).map((r) => r.active);
    expect(await flags()).toEqual([true, false]);
    const both = (c: boolean, n: boolean) =>
      form({
        campaign: { version: p.versions.campaign, value: { ...clone(p.values.campaign), active: c } },
        newsletter: { version: p.versions.newsletter, value: { ...clone(p.values.newsletter), active: n } },
      });
    expect(await saveCampaignForm(db, both(false, true))).toMatchObject({ ok: true });
    expect(await flags()).toEqual([false, true]);
    expect((await getHomeData(db)).popup).toMatchObject({ kind: "newsletter" });
    const q = await loadCampaign(db);
    expect(await saveCampaignForm(db, form({ newsletter: { version: q.versions.newsletter, value: { ...clone(q.values.newsletter), active: false } } }))).toMatchObject({ ok: true });
    expect(await flags()).toEqual([false, false]);
    expect((await getHomeData(db)).popup).toBeNull();
  });

  test("a shown newsletter popup needs its title and picture; a switched-off one may stay unfinished", async () => {
    const p = await loadCampaign(db);
    const nl = (value: object) => form({ newsletter: { version: p.versions.newsletter, value: { ...clone(p.values.newsletter), ...value } } });
    expect(fieldsOf(await saveCampaignForm(db, nl({ active: true, title: { et: "" }, imageKey: "" })))).toEqual({ "newsletter.title": "required", "newsletter.imageKey": "imageRequired" });
    expect(await saveCampaignForm(db, nl({ active: false, title: { et: "" }, imageKey: "" }))).toMatchObject({ ok: true });
  });
```

     (`clone`, `form` and `fieldsOf` are the file's helpers.)
  3. **`tests/db/queries.test.ts`.** In "upsertCampaign keeps a single row …", after `expect(second.title.et).toBe("t2");`, add:

```ts
    // the newsletter row switched on switches the campaign off first (at most one active), in its own fixed row
    const nl = await upsertCampaign(db, { ...input, title: { et: "Uudiskiri" } }, "newsletter");
    expect([nl.id, nl.kind, nl.active]).toEqual([2, "newsletter", true]);
    expect((await db.select().from(campaign).where(eq(campaign.id, 1)))[0].active).toBe(false);
```

- [ ] **Step 2: Run them — expect FAIL.**
- [ ] **Step 3: The domain.**
  1. **`src/domain/campaign.ts`.** Import `type PopupKind` from `@/db/schema` (alongside `Campaign`), and append:

```ts
/** What "Lehel näidatakse" (admin Hüpikaken, phase 2c) is set to: one of the popups, or none. */
export type PopupChoice = PopupKind | "off";

/** The choice the two rows' `active` flags say (the database allows at most one on; were both, the campaign would be the one). */
export function popupShown(campaignActive: boolean, newsletterActive: boolean): PopupChoice {
  return campaignActive ? "campaign" : newsletterActive ? "newsletter" : "off";
}

/** The two rows' `active` flags for a choice: at most one on. */
export function popupFlags(choice: PopupChoice): Record<PopupKind, boolean> {
  return { campaign: choice === "campaign", newsletter: choice === "newsletter" };
}
```

  2. **`src/domain/site-editor.ts`.** After `campaignDraft`, add (import `type Campaign` from `@/db/schema` if the file has no schema import):

```ts
/** Hüpikaken's newsletter popup (phase 2c): shown or not, and its kicker, title, text and picture (no code and no button: it has the form). */
export type NewsletterPopupDraft = { active: boolean; kicker: I18n; title: I18n; text: I18n; imageKey: string };

export function newsletterPopupDraft(c: Campaign | null): NewsletterPopupDraft {
  if (!c) return { active: false, kicker: empty(), title: empty(), text: empty(), imageKey: "" };
  return { active: c.active, kicker: copyI18n(c.kicker), title: copyI18n(c.title), text: copyI18n(c.text), imageKey: c.imageKey };
}
```

- [ ] **Step 4: The queries.**
  1. **`src/db/queries/admin-site.ts`.** Replace `readCampaign` with:

```ts
/** The campaign popup's row (kind "campaign"). */
export async function readCampaign(q: Q): Promise<Campaign | null> {
  const [row] = await q.select().from(campaign).where(eq(campaign.kind, "campaign")).limit(1);
  return row ?? null;
}

/** The newsletter popup's row (kind "newsletter", phase 2c). */
export async function readNewsletterPopup(q: Q): Promise<Campaign | null> {
  const [row] = await q.select().from(campaign).where(eq(campaign.kind, "newsletter")).limit(1);
  return row ?? null;
}
```

  2. **`src/db/queries/admin.ts`.** Import `POPUP_ID` and `type PopupKind` from `../schema`, and `and`, `ne` from `drizzle-orm` if missing. Change `export type CampaignInput = Omit<Insert<typeof campaign>, "id">;` to `export type CampaignInput = Omit<Insert<typeof campaign>, "id" | "kind">;`, and replace `upsertCampaign`:

```ts
/**
 * A popup's fixed row (POPUP_ID: the campaign 1, the newsletter popup 2). At most one popup is shown (the partial unique index
 * campaign_one_active): switching one on switches the other off first, in the caller's transaction.
 */
export async function upsertCampaign(db: Q, input: CampaignInput, kind: PopupKind = "campaign"): Promise<Campaign> {
  const id = POPUP_ID[kind];
  if (input.active) await db.update(campaign).set({ active: false }).where(and(ne(campaign.id, id), eq(campaign.active, true)));
  const [row] = await db.insert(campaign).values({ ...input, id, kind }).onConflictDoUpdate({ target: campaign.id, set: { ...input, kind } }).returning();
  return row;
}
```

- [ ] **Step 5: The admin's parts** (`src/server/admin-site.ts`).
  - Import `readNewsletterPopup`, `newsletterPopupDraft` and `type NewsletterPopupDraft`.
  - The campaign part's write passes its kind: `upsertCampaign(tx, { … }, "campaign")`.
  - Add the newsletter part to `campaignParts`:

```ts
  // Hüpikaken's newsletter popup (phase 2c): a shown one needs its title and its picture; its code, button text and link stay empty
  newsletter: part<NewsletterPopupDraft>({
    tables: ["campaign"],
    schema: z.object({ active: z.boolean(), kicker: i18n, title: i18n, text: i18n, imageKey: text(400) }),
    read: readNewsletterPopup,
    draft: (stored) => newsletterPopupDraft(stored as Campaign | null),
    check: (c, v, name) => {
      const p = `${name}.`;
      const title = c.text(`${p}title`, v.title, L.campaignTitle, { required: v.active });
      const kicker = c.text(`${p}kicker`, v.kicker, L.campaignKicker);
      const body = c.text(`${p}text`, v.text, L.campaignText);
      const imageKey = c.image(`${p}imageKey`, v.imageKey, { required: v.active });
      return async (tx) =>
        void (await upsertCampaign(tx, { active: v.active, kicker: orEmpty(kicker), title: orEmpty(title), text: orEmpty(body), code: "", ctaLabel: { et: "" }, ctaHref: "", imageKey }, "newsletter"));
    },
  }),
```

  - Change `loadCampaign`'s cast to `SavedParts & { values: { campaign: CampaignDraft; newsletter: NewsletterPopupDraft } }`.
  - Rename the section comment to "Hüpikaken (prototype D adminCamp + image upload; phase 2c: the newsletter popup, one shown at a time)".
  - Both parts lock `campaign`. Each part's write switches the other row off before it switches its own on (`upsertCampaign`), so a save of both parts in either order keeps at most one row active.
- [ ] **Step 6: Run** the tests of step 1 — expect PASS.
- [ ] **Step 7: The admin texts** (`src/i18n/dict/admin.ts`).
  - `nav.campaign: "Kampaania"` becomes `"Hüpikaken"`. In `tests/unit/admin.test.ts`, "the sections in Maria's order, …" lists the menu's labels: its `"Kampaania",` becomes `"Hüpikaken",`.
  - Replace the `campaign` section with the following (the two keys `active` and `activeHint` go):

```ts
  campaign: {
    eyebrow: "Turundus",
    title: "Hüpikaken",
    lead: "Esilehel kord külastuse jooksul kuvatav aken: kampaania pakkumine või uudiskirjaga liitumine. Korraga on näha üks või mitte ükski.",
    shown: "Lehel näidatakse",
    shownOptions: { campaign: "Kampaania", newsletter: "Uudiskiri", off: "Väljas" },
    form: "Kampaania",
    newsletterForm: "Uudiskiri",
    newsletterLead: "Hüpikaknas on e-posti väli, nõusolek ja „Liitu“. Tervituskood saadetakse alles pärast kinnitamist (Seaded → Tervituskood), aknas seda ei näidata.",
    kicker: "Silt",
    titleField: "Pealkiri",
    text: "Tekst",
    code: "Sooduskood",
    codeHint: "Tühjaks jättes koodi ei näidata.",
    ctaLabel: "Nupu tekst",
    ctaLabelHint: "Tühjaks jättes: „Leia enda koolitus“.",
    ctaHref: "Nupp viib",
    ctaHrefHint: "Koolituse või lehe aadress, nt /koolitused/lash-lift-botox, või täielik https://-aadress.",
    image: "Pilt",
    preview: "Eelvaade",
    previewNote: "Nii näeb hüpikaken välja avalehel. Laiemal ekraanil on pilt teksti kõrval.",
    off: "Seda akent avalehel praegu ei näidata.",
    copy: "Kopeeri",
    close: "Sulge",
    rules: "Reeglid",
    rulesList: [
      "Kuvatakse esilehel 6 sekundi pärast",
      "Kord külastuse jooksul",
      "Korraga üks aken: kampaania või uudiskiri",
      "Uudiskirja akent ei näidata enam brauseris, kust sellega liituti",
      "Mitte ostukorvis, tundides ega testides",
      "Sulgub Esc, ✕ või taustale vajutades, telefonis ka alla libistades",
    ],
  },
```

- [ ] **Step 8: The editor.** Replace `src/components/admin/CampaignEditor.tsx` with:

```tsx
"use client";

import { useId, useRef, useState } from "react";
import { CampaignCard } from "@/components/site/CampaignCard";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { NewsletterPopupCard } from "@/components/site/NewsletterPopupCard";
import { popupFlags, popupShown, type PopupChoice } from "@/domain/campaign";
import { CAMPAIGN_CTA, SITE_LIMITS, type CampaignDraft, type NewsletterPopupDraft } from "@/domain/site-editor";
import { adminEt } from "@/i18n/dict/admin";
import { getDict } from "@/i18n/locales";
import { pick } from "@/i18n/field";
import { mediaUrl } from "@/lib/media";
import { saveCampaign } from "@/server/actions/admin-site";
import { Choice } from "./Choice";
import { I18nInput, LangSwitch, type Lang } from "./I18nInput";
import { SaveBar } from "./SaveBar";
import { SingleImage } from "./SingleImage";
import { TextField } from "./TextField";
import { useSiteDraft, type Loaded } from "./useSiteDraft";
import ui from "./ui.module.css";
import ed from "./editor.module.css";
import styles from "./site-editor.module.css";

const CHOICES: PopupChoice[] = ["campaign", "newsletter", "off"];

/**
 * Hüpikaken (prototype D's adminCamp, Maria C38/C42; phase 2c): at the top "Lehel näidatakse" — Kampaania, Uudiskiri or Väljas, one
 * popup at a time (the save switches the two rows' flags together) — then the two popups' editors, each with the card as a live
 * preview (ET or RU): the campaign (kicker, title, text, code, the button's text and link, the picture; the button says "Leia enda
 * koolitus", M4; no "Mitte praegu", M3) and the newsletter sign-up (kicker, title, text, picture; its form is the footer's). The home
 * page's popups (components/site/CampaignPopup.tsx, NewsletterPopup.tsx) show these same cards, so the previews are what visitors see.
 */
export function CampaignEditor({ initial, links }: { initial: Loaded<{ campaign: CampaignDraft; newsletter: NewsletterPopupDraft }>; links: string[] }) {
  const t = adminEt.campaign;
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const d = useSiteDraft(initial, saveCampaign, form);
  const c = d.draft.campaign;
  const n = d.draft.newsletter;
  const shown = popupShown(c.active, n.active);
  const show = (choice: PopupChoice) => {
    const on = popupFlags(choice);
    d.update("campaign", (x) => ({ ...x, active: on.campaign }));
    d.update("newsletter", (x) => ({ ...x, active: on.newsletter }));
  };
  const setC = (patch: Partial<CampaignDraft>) => d.update("campaign", (x) => ({ ...x, ...patch }));
  const setN = (patch: Partial<NewsletterPopupDraft>) => d.update("newsletter", (x) => ({ ...x, ...patch }));
  const errC = (f: string) => d.err(`campaign.${f}`);
  const errN = (f: string) => d.err(`newsletter.${f}`);
  const [langC, setLangC] = useState<Lang>("et");
  const [langN, setLangN] = useState<Lang>("et");

  const campaignPreview = {
    image: c.imageKey ? mediaUrl(c.imageKey) : "",
    kicker: pick(c.kicker, langC),
    title: pick(c.title, langC),
    text: pick(c.text, langC),
    code: c.code.trim().toUpperCase(),
    ctaLabel: pick(c.ctaLabel, langC) || CAMPAIGN_CTA,
    ctaHref: c.ctaHref,
  };
  const newsletterPreview = { image: n.imageKey ? mediaUrl(n.imageKey) : "", kicker: pick(n.kicker, langN), title: pick(n.title, langN), text: pick(n.text, langN) };
  const site = getDict(langN);

  return (
    <form ref={form} className={ui.page} onSubmit={d.submit} noValidate data-campaign-editor="">
      <div className={ui.heading}>
        <div>
          <p className={ui.eyebrow}>{t.eyebrow}</p>
          <h1 className={ui.h1}>{t.title}</h1>
          <p className={ui.lead}>{t.lead}</p>
        </div>
      </div>

      <section className={ui.card} aria-labelledby={`${uid}-shown`}>
        <fieldset className={ed.fieldset} data-popup-shown={shown}>
          <legend id={`${uid}-shown`} className={ui.legend}>
            {t.shown}
          </legend>
          <div className={ed.choices}>
            {CHOICES.map((choice) => (
              <Choice
                key={choice}
                className={ed.choice}
                label={t.shownOptions[choice]}
                type="radio"
                name={`${uid}-shown`}
                value={choice}
                checked={shown === choice}
                onChange={() => show(choice)}
                data-popup-choice={choice}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <div className={styles.cols} data-popup-section="campaign">
        <section className={ui.card} aria-labelledby={`${uid}-form`}>
          <h2 id={`${uid}-form`} className={ui.h3}>
            {t.form}
          </h2>
          <div className={styles.fields}>
            <I18nInput label={t.kicker} value={c.kicker} onChange={(kicker) => setC({ kicker })} maxLength={SITE_LIMITS.campaignKicker} error={errC("kicker")} name="campaign.kicker" />
            <I18nInput label={t.titleField} value={c.title} onChange={(title) => setC({ title })} maxLength={SITE_LIMITS.campaignTitle} error={errC("title")} name="campaign.title" />
            <I18nInput label={t.text} value={c.text} onChange={(text) => setC({ text })} multiline rows={3} maxLength={SITE_LIMITS.campaignText} error={errC("text")} name="campaign.text" />
            <div className={styles.pair}>
              <TextField label={t.code} value={c.code} onChange={(code) => setC({ code })} maxLength={SITE_LIMITS.code} hint={t.codeHint} error={errC("code")} name="campaign.code" />
              <I18nInput label={t.ctaLabel} value={c.ctaLabel} onChange={(ctaLabel) => setC({ ctaLabel })} maxLength={SITE_LIMITS.ctaLabel} hint={t.ctaLabelHint} placeholder={CAMPAIGN_CTA} error={errC("ctaLabel")} name="campaign.ctaLabel" />
            </div>
            <TextField label={t.ctaHref} value={c.ctaHref} onChange={(ctaHref) => setC({ ctaHref })} maxLength={SITE_LIMITS.href} hint={t.ctaHrefHint} error={errC("ctaHref")} inputMode="url" suggestions={links} name="campaign.ctaHref" />
            <SingleImage label={t.image} value={c.imageKey} onChange={(imageKey) => setC({ imageKey })} error={errC("imageKey")} ratio="16 / 9" name="campaign" />
          </div>
        </section>

        <div className={styles.aside}>
          <section className={ui.card} aria-labelledby={`${uid}-preview`}>
            <div className={styles.previewHead}>
              <h2 id={`${uid}-preview`} className={ui.h3}>
                {t.preview}
              </h2>
              <LangSwitch lang={langC} onChange={setLangC} label={t.preview} missingRu={false} />
            </div>
            {shown !== "campaign" && <p className={`${ui.notice} ${styles.cardLead}`}>{t.off}</p>}
            {/* inert: the preview's button and copy button are pictures of the real ones */}
            <div className={styles.previewBox} inert data-campaign-preview="" data-off={shown === "campaign" ? undefined : ""} lang={langC}>
              <CampaignCard
                c={campaignPreview}
                locale={langC}
                codeAction={
                  <button type="button" tabIndex={-1}>
                    {t.copy}
                  </button>
                }
              />
            </div>
            <p className={`${ui.muted} ${ui.small} ${styles.previewNote}`}>{t.previewNote}</p>
          </section>
          <section className={ui.card} aria-labelledby={`${uid}-rules`}>
            <h2 id={`${uid}-rules`} className={ui.h3}>
              {t.rules}
            </h2>
            <ul className={styles.rules}>
              {t.rulesList.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className={styles.cols} data-popup-section="newsletter">
        <section className={ui.card} aria-labelledby={`${uid}-nl`}>
          <h2 id={`${uid}-nl`} className={ui.h3}>
            {t.newsletterForm}
          </h2>
          <p className={`${ui.muted} ${styles.cardLead}`}>{t.newsletterLead}</p>
          <div className={styles.fields}>
            <I18nInput label={t.kicker} value={n.kicker} onChange={(kicker) => setN({ kicker })} maxLength={SITE_LIMITS.campaignKicker} error={errN("kicker")} name="newsletter.kicker" />
            <I18nInput label={t.titleField} value={n.title} onChange={(title) => setN({ title })} maxLength={SITE_LIMITS.campaignTitle} error={errN("title")} name="newsletter.title" />
            <I18nInput label={t.text} value={n.text} onChange={(text) => setN({ text })} multiline rows={3} maxLength={SITE_LIMITS.campaignText} error={errN("text")} name="newsletter.text" />
            <SingleImage label={t.image} value={n.imageKey} onChange={(imageKey) => setN({ imageKey })} error={errN("imageKey")} ratio="16 / 9" name="newsletter" />
          </div>
        </section>
        <div className={styles.aside}>
          <section className={ui.card} aria-labelledby={`${uid}-nl-preview`}>
            <div className={styles.previewHead}>
              <h2 id={`${uid}-nl-preview`} className={ui.h3}>
                {t.preview}
              </h2>
              <LangSwitch lang={langN} onChange={setLangN} label={`${t.preview}: ${t.newsletterForm}`} missingRu={false} />
            </div>
            {shown !== "newsletter" && <p className={`${ui.notice} ${styles.cardLead}`}>{t.off}</p>}
            {/* inert: the form in the preview is a picture of the real one (`preview`: no <form> inside this editor's form, nothing is sent from here) */}
            <div className={styles.previewBox} inert data-newsletter-preview="" data-off={shown === "newsletter" ? undefined : ""} lang={langN}>
              <NewsletterPopupCard
                n={newsletterPreview}
                form={
                  <NewsletterForm
                    locale={langN}
                    preview
                    t={{ ...site.newsletter, sentTitle: "", sentText: site.newsletter.popupSent, errorEmail: "", errorRequired: "", errorTooMany: "", errorGeneric: "" }}
                  />
                }
              />
            </div>
          </section>
        </div>
      </div>

      <SaveBar status={d.status} pending={d.pending} reloadHref="/admin/kampaania" />
    </form>
  );
}
```

     Three notes on this code:
     - **`LangSwitch`** names its group "Keel: {label}": the two previews' switches are "Keel: Eelvaade" and "Keel: Eelvaade: Uudiskiri". The e2e's "Keel: Nupu tekst" is the campaign's `I18nInput`.
     - **The radio group** uses `ed.fieldset`, `ed.choices`, `ed.choice` and `ui.legend` as `LessonDrawer.tsx`'s "Õppetunni liik" does.
     - **The newsletter preview's form is `NewsletterForm` with `preview`** (Task 7): the whole editor is one `<form>`, and a `<form>` inside it would be dropped by the HTML parser (a hydration error on this server-rendered page); the picture also has no honeypot, whose input would fail "every editor at phone width" (every `main input:visible` at least 44 px).

     In `app/admin/(panel)/kampaania/page.tsx`, the comment becomes "Hüpikaken: what the home page shows (Kampaania, Uudiskiri or Väljas) and both popups' editors with their live previews (Task 13B, M2–M5; phase 2c)."
- [ ] **Step 9: E2E.**
  1. **`tests/e2e/admin-inbox.spec.ts`.** In `MENU`, `"Kampaania"` becomes `"Hüpikaken"`. The row `["Kampaania", "/admin/kampaania", "Kampaania hüpikaken", "[data-campaign-editor]"]` becomes `["Hüpikaken", "/admin/kampaania", "Hüpikaken", "[data-campaign-editor]"]`.
  2. **`tests/e2e/admin-site.spec.ts`**, in "the uploaded image is stored, …":
     - The heading check becomes `toHaveText("Hüpikaken")`.
     - The page has two editors now, so add `const camp = page.locator('[data-popup-section="campaign"]');` and scope the campaign's textboxes, combobox and the "Keel: Nupu tekst" group to it: `camp.getByRole(…)` in place of `page.getByRole(…)` for "Pealkiri (eesti keeles)", "Sooduskood", "Nupp viib", "Nupu tekst (eesti keeles)", "Keel: Nupu tekst" and "Nupu tekst (vene keeles)".
  3. In the describe "the newsletter popup (phase 2c)" of Task 7, append:

```ts
  test("Hüpikaken: 'Lehel näidatakse' Uudiskiri, its texts and the preview, saved; the home page shows it; Väljas shows none", async ({ page, context, visitorIp }, info) => {
    test.skip(phone(info), "one popup row: desktop changes it");
    await changing(["campaign"]);
    await signIn(page, context, visitorIp);
    await page.goto("/admin/kampaania");
    await adminReady(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hüpikaken");
    const shown = page.getByRole("group", { name: "Lehel näidatakse" });
    await expect(shown.getByRole("radio", { name: "Kampaania" })).toBeChecked();
    await shown.getByRole("radio", { name: "Uudiskiri" }).check();
    const nl = page.locator('[data-popup-section="newsletter"]');
    await nl.getByRole("textbox", { name: "Pealkiri (eesti keeles)", exact: true }).fill("E2E uudiskiri");
    const preview = page.locator("[data-newsletter-preview]");
    await expect(preview.getByRole("heading")).toHaveText("E2E uudiskiri");
    await expect(preview.getByRole("button", { name: "Liitu" })).toBeVisible();
    await expect(page.locator("[data-campaign-editor] form")).toHaveCount(0); // the preview's form is a picture: no form inside the editor's
    await save(page);
    const rows = await onLocalDb((sql) => sql<{ id: number; active: boolean }[]>`select id, active from campaign order by id`);
    expect(rows.map((r) => r.active)).toEqual([false, true]);
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "E2E uudiskiri" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/admin/kampaania");
    await adminReady(page);
    await page.getByRole("group", { name: "Lehel näidatakse" }).getByRole("radio", { name: "Väljas" }).check();
    await save(page);
    expect((await onLocalDb((sql) => sql<{ active: boolean }[]>`select active from campaign order by id`)).map((r) => r.active)).toEqual([false, false]);
  });
```

     (`signIn`, `adminReady`, `save`, `phone` and `changing` are the file's helpers.)
- [ ] **Step 10: Run** `npx vitest run`, tsc, lint, then `npx playwright test admin-site admin-inbox campaign` (dev) — green.
- [ ] **Step 11: Commit.**

```bash
git add app/src/domain/campaign.ts app/src/domain/site-editor.ts app/src/db/queries/admin-site.ts app/src/db/queries/admin.ts app/src/server/admin-site.ts app/src/components/admin/CampaignEditor.tsx "app/src/app/admin/(panel)/kampaania/page.tsx" app/src/i18n/dict/admin.ts app/tests
git commit -m "feat(admin): Hüpikaken — Kampaania, Uudiskiri or Väljas, and the newsletter popup's texts and picture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: The welcome code — the setting, the welcome mail, the confirmed page, and Minu andmed

Spec section 5 (Welcome code).
- **The setting:** Seaded gets "Tervituskood" (`newsletter.welcomeCode`, empty by default; A–Z, 0–9 and `-`, at most 30).
- **The first confirmation only:** when a code is set, one "Tere tulemast MS LABi!" mail goes out with the code and how to use it, and the confirmed notice on `/?uudiskiri=kinnitatud` shows the code too. A repeat confirmation sends nothing.
- **Every sign-up path** gets the same code: the footer and the popup.
- **Minu andmed:** a client who switches the newsletter on is confirmed at once and gets the same mail, once.
- **How the page gets the code:** the home page is cached for every visitor, so its HTML must not hold the code: anyone could read it without subscribing. The confirmation link's redirect carries the code in the address's **fragment** (`/?uudiskiri=kinnitatud#kood=<CODE>`), which no server or cache sees. `FlashNotice` reads it in the browser and removes it.
- **"Once":**
  - the conditional confirm (`confirmed_at is null`) makes the link's first use the only one;
  - a KV mark under the hash of the address (one per 365 days) stops a second welcome when she switches the newsletter off and on again.
- The welcome mail counts against the day's confirmation cap (`CONFIRMATION_MAIL_DAILY_CAP`, the `mail_quota` row).

**Files:**
- Create: `app/src/domain/welcome-code.ts`, `app/src/server/newsletter.ts`
- Modify: `app/src/server/submit.ts` (`confirmSubscriber`), `app/src/app/api/newsletter/confirm/route.ts`, `app/src/server/account-mail.ts` (`welcomeMail`), `app/src/server/account-api.ts` (the `newsletter` handler)
- Modify: `app/src/components/site/FlashNotice.tsx`, `app/src/app/[locale]/(site)/page.tsx`
- Modify: `app/src/domain/site-editor.ts`, `app/src/server/admin-site.ts`, `app/src/components/admin/SettingsEditor.tsx`, `app/src/i18n/dict/admin.ts`, `et.ts`, `ru.ts`
- Test: `app/tests/unit/welcome-code.test.ts` (new), `app/tests/unit/account-mail.test.ts`, `app/tests/unit/flash-notice.test.ts`, `app/tests/db/newsletter-welcome.test.ts` (new), `app/tests/db/actions.test.ts`, `app/tests/db/admin-site.test.ts`

**Interfaces:**
- Produces, from `src/domain/welcome-code.ts`:
  - `const WELCOME_CODE_MAX = 30`;
  - `normalizeWelcomeCode(typed: string): string`, `isWelcomeCode(code: string): boolean`, `welcomeCodeOf(setting: unknown): string`;
  - `welcomeFragment(code: string): string` and `const WELCOME_FRAGMENT: RegExp`.
- Produces, from `src/server/submit.ts`: `confirmSubscriber(db, token, now): Promise<{ sub: Subscriber; first: boolean } | null>`.
- Produces, from `src/server/newsletter.ts`:
  - `type NewsletterState = "yes" | "pending" | "no"` and `newsletterState(db: Q, email: string): Promise<NewsletterState>`;
  - `clientNewsletter(db: Db, clientId: number): Promise<{ email: string; locale: "et" | "ru"; state: NewsletterState } | null>`;
  - `type WelcomeDeps = { db: Db; env: Env; now: Date }` and `sendWelcome(deps: WelcomeDeps, to: { email: string; locale: string }): Promise<void>` (never throws);
  - `confirmNewsletter(deps: WelcomeDeps & { later: (task: () => Promise<unknown>) => void }, token: string): Promise<{ outcome: "kinnitatud" | "vigane"; locale: "et" | "ru"; code: string | null }>`.
- Produces, from `src/server/account-mail.ts`: `welcomeMail(email: string, code: string, locale: Locale): Mail`.
- Produces, from `FlashNotice.tsx`: `FlashMessage.codeLine?: string` (filled from `#kood=<CODE>`).
- Produces, from `src/domain/site-editor.ts`: `NewsletterDraft = { discountLabel: string; welcomeCode: string }`.
- Produces, in the dictionaries: `newsletter.codeLine` and `mail.welcome.{ subject, intro, codeIntro, use, invoice }`.

- [ ] **Step 1: Write the failing pure tests.**
  1. **Create `tests/unit/welcome-code.test.ts`:**

```ts
import { describe, expect, test } from "vitest";
import { isWelcomeCode, normalizeWelcomeCode, WELCOME_CODE_MAX, WELCOME_FRAGMENT, welcomeCodeOf, welcomeFragment } from "@/domain/welcome-code";

describe("the welcome code (Seaded 'Tervituskood', phase 2c)", () => {
  test("as typed → as stored: trimmed, in capitals", () => {
    expect(normalizeWelcomeCode("  tere-10 ")).toBe("TERE-10");
  });

  test("A–Z, 0–9 and '-', at most 30; empty is no code (allowed)", () => {
    expect(WELCOME_CODE_MAX).toBe(30);
    for (const ok of ["", "TERE10", "MS-LAB-2026", "A".repeat(30)]) expect(isWelcomeCode(ok), ok).toBe(true);
    for (const bad of ["TERE 10", "tere10", "ÕUN", "A".repeat(31), "X_1", "<b>"]) expect(isWelcomeCode(bad), bad).toBe(false);
  });

  test("the stored setting → its code, or '' (none, or a stored value of another shape)", () => {
    expect(welcomeCodeOf({ discountLabel: "10%", welcomeCode: "TERE10" })).toBe("TERE10");
    expect(welcomeCodeOf({ discountLabel: "10%" })).toBe("");
    expect(welcomeCodeOf({ welcomeCode: "tere 10" })).toBe("");
    expect(welcomeCodeOf(null)).toBe("");
    expect(welcomeCodeOf("TERE10")).toBe("");
  });

  test("the confirmed page's fragment: kood=<CODE>, read back only in that shape", () => {
    expect(welcomeFragment("TERE10")).toBe("kood=TERE10");
    expect(WELCOME_FRAGMENT.exec("kood=TERE-10")?.[1]).toBe("TERE-10");
    expect(WELCOME_FRAGMENT.exec("kood=<script>")).toBeNull();
    expect(WELCOME_FRAGMENT.exec("kood=")).toBeNull();
  });
});
```

  2. **`tests/unit/account-mail.test.ts`.** Import `welcomeMail` and append:

```ts
describe("the welcome mail (phase 2c)", () => {
  test("Estonian: the subject, the code large, how to use it, and that Maria applies it on the invoice", () => {
    const mail = welcomeMail("uus@example.test", "TERE10", "et");
    expect(mail.to).toBe("uus@example.test");
    expect(mail.subject).toBe("Tere tulemast MS LABi!");
    expect(mail.text).toBe(["Tere!", "", "Aitäh, et liitusid MS LABi uudiskirjaga.", "", "Sinu tervituskood:", "", "TERE10", "", "Lisa kood registreerimisel lahtrisse „Sõnum“.", "Maria arvestab soodustuse sinu arvel.", "", "MS LAB Koolituskeskus"].join("\n"));
    expect(mail.html).toContain(">TERE10</div>");
    expect(mail.html).toContain("Lisa kood registreerimisel lahtrisse „Sõnum“.");
  });

  test("Russian", () => {
    const mail = welcomeMail("uus@example.test", "TERE10", "ru");
    expect(mail.subject).toBe("Добро пожаловать в MS LAB!");
    expect(mail.text).toContain("Укажите код при регистрации в поле «Сообщение».");
  });
});
```

  3. **`tests/unit/flash-notice.test.ts`.** Add to its describe (it uses the file's `root`, `region` and `address`):

```ts
  test("the confirmed notice with a welcome code from the fragment (#kood=…, phase 2c): the line with the code, and the fragment goes; a code of another shape is ignored", async () => {
    const withCode: Record<string, FlashMessage> = {
      kinnitatud: { tone: "ok", title: "Tere tulemast MS LABi!", text: "Sinu liitumine on kinnitatud.", codeLine: "Sinu tervituskood: {code}." },
    };
    const render = async (at: string) => {
      window.history.replaceState(null, "", at);
      await act(async () => root.render(createElement(FlashNotice, { key: at, param: "uudiskiri", notices: withCode, closeLabel: "Sulge" })));
    };
    await render("/?uudiskiri=kinnitatud#kood=TERE-10");
    expect(document.querySelector("[data-flash-code]")?.textContent).toBe("Sinu tervituskood: TERE-10.");
    expect(address()).toBe("/");
    await render("/?uudiskiri=kinnitatud#kood=<b>x</b>");
    expect(document.querySelector("[data-flash-code]")).toBeNull();
    expect(region().textContent).toContain("Tere tulemast MS LABi!");
  });
```
- [ ] **Step 2: Run them — expect FAIL.**
- [ ] **Step 3: Implement the pure parts.**
  1. **Create `src/domain/welcome-code.ts`:**

```ts
// The newsletter's welcome code (phase 2c, spec 5): Seaded "Tervituskood" (settings key "newsletter", field welcomeCode), sent after
// an address's first confirmation in the welcome mail and shown on the confirmed page. Pure: no database, no React.

/** The longest welcome code. */
export const WELCOME_CODE_MAX = 30;

const SHAPE = /^[A-Z0-9-]{1,30}$/;

/** As the admin typed it → as stored: trimmed, in capitals. */
export const normalizeWelcomeCode = (typed: string): string => typed.trim().toUpperCase();

/** A code that may be stored: A–Z, 0–9 and "-", at most 30; "" (no code) too. */
export const isWelcomeCode = (code: string): boolean => code === "" || SHAPE.test(code);

/** The stored `newsletter` setting → its welcome code, or "" (none, or a value of another shape: never shown). */
export function welcomeCodeOf(setting: unknown): string {
  const value = setting && typeof setting === "object" && !Array.isArray(setting) ? (setting as Record<string, unknown>).welcomeCode : null;
  return typeof value === "string" && SHAPE.test(value) ? value : "";
}

/**
 * The fragment the confirmation link's redirect carries to the home page: `kood=<CODE>`. A fragment, never the query: the home page is
 * cached for every visitor, and no server or cache ever sees a fragment (FlashNotice reads it in the browser and removes it).
 */
export const welcomeFragment = (code: string): string => `kood=${code}`;

/** The welcome code in a page's fragment (without "#"), read back only in its own shape. */
export const WELCOME_FRAGMENT = /^kood=([A-Z0-9-]{1,30})$/;
```

  2. **`src/components/site/FlashNotice.tsx`.**
     - Import `fill` from `@/i18n/format` and `WELCOME_FRAGMENT` from `@/domain/welcome-code`.
     - Change the type to:

```ts
export type FlashMessage = {
  tone: "ok" | "warn";
  title: string;
  text?: string;
  /** With `#kood=<CODE>` in the address (the newsletter's first confirmation, phase 2c): this line, {code} filled; else nothing. */
  codeLine?: string;
};
```

     - In the effect, replace the `if (value !== null) { … }` branch with:

```ts
    if (value !== null) {
      url.searchParams.delete(param);
      const found = Object.hasOwn(notices, value) ? notices[value] : null;
      const code = WELCOME_FRAGMENT.exec(mark)?.[1];
      if (code) url.hash = "";
      notice = found && { ...found, codeLine: code && found.codeLine ? fill(found.codeLine, { code }) : undefined };
    } else if (mark && Object.hasOwn(fragments, mark)) {
```

     - In the markup, after `{shown.text && <span>{shown.text}</span>}`, add `{shown.codeLine && <span data-flash-code="">{shown.codeLine}</span>}`.
     - Add to the doc comment: "The newsletter's confirmed notice may get a welcome code from the fragment (`#kood=<CODE>`, phase 2c): its `codeLine` shows it, and the fragment goes too."
  3. **`src/server/account-mail.ts`.** After `deletionMail`, add:

```ts
/**
 * The welcome mail after an address's first newsletter confirmation (phase 2c, server/newsletter.ts sendWelcome): the welcome code
 * large (the login code's lilac box) and how to use it, with no button. Plain text and HTML. The caller never sends it to a sample
 * address or in development.
 */
export function welcomeMail(email: string, code: string, locale: Locale): Mail {
  const w = getDict(locale).mail.welcome;
  const mail = getDict(locale).account.mail;
  const text = [mail.greeting, "", w.intro, "", w.codeIntro, "", code, "", w.use, w.invoice, "", mail.signature].join("\n");
  const html = mailCard(w.subject, locale, [
    greetingRow(mail.greeting),
    paragraphRow(w.intro),
    paragraphRow(w.codeIntro),
    codeRow(code),
    paragraphRow(w.use),
    paragraphRow(w.invoice, 8),
    signatureRow(mail),
  ]);
  return { to: email, subject: w.subject, text, html };
}
```

  4. **Dictionaries.**
     - `et.ts`, in `newsletter` after `confirmedText`:

```ts
    // the confirmed notice's line when Seaded has a welcome code (the confirmation link's #kood=…, phase 2c)
    codeLine: "Sinu tervituskood: {code}. Lisa kood registreerimisel lahtrisse „Sõnum“.",
```

     - `et.ts`, in `mail` after `confirmText`:

```ts
    // The welcome mail after the first confirmation (server/account-mail.ts welcomeMail, phase 2c): the code is Seaded "Tervituskood".
    welcome: {
      subject: "Tere tulemast MS LABi!",
      intro: "Aitäh, et liitusid MS LABi uudiskirjaga.",
      codeIntro: "Sinu tervituskood:",
      use: "Lisa kood registreerimisel lahtrisse „Sõnum“.",
      invoice: "Maria arvestab soodustuse sinu arvel.",
    },
```

     - `ru.ts`:

```ts
    codeLine: "Ваш приветственный код: {code}. Укажите его при регистрации в поле «Сообщение».",
```

```ts
    welcome: {
      subject: "Добро пожаловать в MS LAB!",
      intro: "Спасибо, что подписались на рассылку MS LAB.",
      codeIntro: "Ваш приветственный код:",
      use: "Укажите код при регистрации в поле «Сообщение».",
      invoice: "Мария учтёт скидку в вашем счёте.",
    },
```

- [ ] **Step 4: Run** the three test files — expect PASS.
- [ ] **Step 5: Write the failing DB tests.**
  1. **`tests/db/actions.test.ts`.** `confirmSubscriber` now answers `{ sub, first }`:
     - In "confirmSubscriber sets confirmedAt once; …", the two checks become `expect(first).toMatchObject({ first: true, sub: { confirmedAt: new Date("2026-10-03T00:00:00Z") } });` and `expect(again).toMatchObject({ first: false, sub: { confirmedAt: new Date("2026-10-03T00:00:00Z") } });`.
     - Change the title to "confirmSubscriber sets confirmedAt once and says whether this was the first time; …".
     - The `toBeNull()` lines stay.
  2. **Create `tests/db/newsletter-welcome.test.ts`:**

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { clients, clientSessions, mailQuota, settings, subscribers } from "@/db/schema";
import { handleAccountApi, type AccountDeps } from "@/server/account-api";
import { CLIENT_SESSION_TTL_MS, CONFIRMATION_MAIL_DAILY_CAP } from "@/server/client-auth";
import { clientNewsletter, confirmNewsletter, newsletterState } from "@/server/newsletter";
import type { Env } from "@/server/notify";
import { newToken, sha256 } from "@/server/token";
import { fakeKv, stubFetch } from "../fakes";
import { makeTestDb } from "./helpers";

// Phase 2c (spec 5): the welcome code goes out after an address's first confirmation — the link (confirmNewsletter) or "Saada mulle
// uudiskirja" in Minu andmed — once, in the address's language, only when Seaded has a code; never again for that address this year.
// Mails go to a stubbed Resend (addresses at example.com: a sample address, @example.test, is never mailed).

const NOW = new Date("2026-10-08T10:00:00Z");
let db: Db;
let kv: ReturnType<typeof fakeKv>;
const env = (): Env => ({ KV: kv, MAIL_FROM: "MS LAB <info@send.example>", MARIA_EMAIL: "maria@example.test", SITE_URL: "https://mslab.example", RESEND_API_KEY: "re_test" });

beforeEach(async () => {
  db = await makeTestDb();
  kv = fakeKv();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const outbox = () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  return () => f.calls.filter((c) => c.url.includes("resend")).map((c) => c.body as { to: string; subject: string; text: string });
};
const setCode = (welcomeCode: string) => db.insert(settings).values({ key: "newsletter", value: { discountLabel: "10%", welcomeCode } }).onConflictDoUpdate({ target: settings.key, set: { value: { discountLabel: "10%", welcomeCode } } });

/** confirmNewsletter with the work after the response collected; `run()` does it. */
function confirm(token: string, now = NOW) {
  const tasks: (() => Promise<unknown>)[] = [];
  const result = confirmNewsletter({ db, env: env(), now, later: (t) => void tasks.push(t) }, token);
  return { result, run: async () => Promise.all(tasks.splice(0).map((t) => t())) };
}

test("the first confirmation with a code set: the code for the confirmed page and one welcome mail in the subscriber's language; a repeat: neither", async () => {
  const mails = outbox();
  await setCode("TERE10");
  await db.insert(subscribers).values({ email: "uus@example.com", locale: "ru", token: "t".repeat(43) });
  const first = confirm("t".repeat(43));
  expect(await first.result).toEqual({ outcome: "kinnitatud", locale: "ru", code: "TERE10" });
  await first.run();
  expect(mails().map((m) => [m.to, m.subject])).toEqual([["uus@example.com", "Добро пожаловать в MS LAB!"]]);
  expect(mails()[0].text).toContain("TERE10");
  const again = confirm("t".repeat(43), new Date(NOW.getTime() + 60_000));
  expect(await again.result).toEqual({ outcome: "kinnitatud", locale: "ru", code: null });
  await again.run();
  expect(mails()).toHaveLength(1);
});

test("no code set: confirmed, no code and no mail; an unknown token: vigane", async () => {
  const mails = outbox();
  await setCode("");
  await db.insert(subscribers).values({ email: "uus@example.com", token: "u".repeat(43) });
  const c = confirm("u".repeat(43));
  expect(await c.result).toEqual({ outcome: "kinnitatud", locale: "et", code: null });
  await c.run();
  expect(mails()).toEqual([]);
  expect(await confirm("x".repeat(43)).result).toEqual({ outcome: "vigane", locale: "et", code: null });
});

test("never twice for one address: switched off and on again (a new row), the welcome mail does not come again; the day's cap counts it", async () => {
  const mails = outbox();
  await setCode("TERE10");
  await db.insert(subscribers).values({ email: "uus@example.com", token: "a".repeat(43) });
  const one = confirm("a".repeat(43));
  await one.result;
  await one.run();
  await db.delete(subscribers);
  await db.insert(subscribers).values({ email: "uus@example.com", token: "b".repeat(43) });
  const two = confirm("b".repeat(43));
  expect((await two.result).code).toBe("TERE10"); // the page still shows the code of a first confirmation
  await two.run();
  expect(mails()).toHaveLength(1);
  expect((await db.select().from(mailQuota))[0].sent).toBe(1);
});

test("the day's confirmation cap reached: no welcome mail", async () => {
  const mails = outbox();
  await setCode("TERE10");
  await db.insert(mailQuota).values({ day: NOW.toISOString().slice(0, 10), sent: CONFIRMATION_MAIL_DAILY_CAP });
  await db.insert(subscribers).values({ email: "uus@example.com", token: "c".repeat(43) });
  const c = confirm("c".repeat(43));
  await c.result;
  await c.run();
  expect(mails()).toEqual([]);
});

test("newsletterState and clientNewsletter: yes / pending / no, whatever the stored case", async () => {
  await db.insert(subscribers).values([{ email: "Yes@Example.com", token: "1", confirmedAt: NOW }, { email: "pending@example.com", token: "2" }]);
  expect(await newsletterState(db, "yes@example.com")).toBe("yes");
  expect(await newsletterState(db, "PENDING@example.com")).toBe("pending");
  expect(await newsletterState(db, "no@example.com")).toBe("no");
  const [kati] = await db.insert(clients).values({ email: "yes@example.com", locale: "ru" }).returning();
  expect(await clientNewsletter(db, kati.id)).toEqual({ email: "yes@example.com", locale: "ru", state: "yes" });
  expect(await clientNewsletter(db, 987654)).toBeNull();
});

test("Minu andmed: 'Saada mulle uudiskirja' on confirms at once and sends the welcome mail once; on again, or off and on, no second mail", async () => {
  const mails = outbox();
  await setCode("TERE10");
  const [kati] = await db.insert(clients).values({ email: "kati@example.com" }).returning();
  const raw = newToken();
  await db.insert(clientSessions).values({ idHash: await sha256(raw), clientId: kati.id, createdAt: NOW, expiresAt: new Date(NOW.getTime() + CLIENT_SESSION_TTL_MS) });
  const tasks: (() => Promise<unknown>)[] = [];
  const deps: AccountDeps = { db, env: env(), now: NOW, siteUrl: "https://mslab.example", later: (t) => void tasks.push(t), dev: false };
  const post = async (on: boolean) => {
    const res = (await handleAccountApi(new Request("https://mslab.example/api/konto/uudiskiri", { method: "POST", headers: { cookie: `__Host-mslab_client=${raw}` }, body: JSON.stringify({ on }) }), deps))!;
    await Promise.all(tasks.splice(0).map((t) => t()));
    return res.status;
  };
  expect(await post(true)).toBe(200);
  expect(mails().map((m) => m.subject)).toEqual(["Tere tulemast MS LABi!"]);
  expect(await post(true)).toBe(200); // already on
  expect(await post(false)).toBe(200);
  expect(await post(true)).toBe(200); // a new row, confirmed at once: the KV mark stops a second welcome
  expect(mails()).toHaveLength(1);
  expect((await db.select().from(subscribers).where(eq(subscribers.email, "kati@example.com")))[0].confirmedAt).toEqual(NOW);
});
```

- [ ] **Step 6: Run it — expect FAIL**: `@/server/newsletter` does not exist.
- [ ] **Step 7: Implement the server side.**
  1. **`src/server/submit.ts`.** Replace `confirmSubscriber` (import `isNull` from `drizzle-orm`):

```ts
/**
 * The confirmation link: sets `confirmedAt` once (later clicks keep the first time). `first` is true for the click that confirmed it
 * (the welcome mail follows that one only, server/newsletter.ts). null = unknown token.
 */
export async function confirmSubscriber(db: Db, token: string, now: Date): Promise<{ sub: Subscriber; first: boolean } | null> {
  if (!isTokenShape(token)) return null;
  const [confirmed] = await db.update(subscribers).set({ confirmedAt: now }).where(and(eq(subscribers.token, token), isNull(subscribers.confirmedAt))).returning();
  if (confirmed) return { sub: confirmed, first: true };
  const [row] = await db.select().from(subscribers).where(eq(subscribers.token, token)).limit(1);
  return row ? { sub: row, first: false } : null;
}
```

  2. **Create `src/server/newsletter.ts`:**

```ts
import { eq, sql } from "drizzle-orm";
import type { Db, Q } from "@/db/client";
import { readSetting } from "@/db/queries/public";
import { clients, subscribers } from "@/db/schema";
import { isSampleAddress, normalizeEmail } from "@/domain/email";
import { welcomeCodeOf } from "@/domain/welcome-code";
import { welcomeMail } from "./account-mail";
import { CONFIRMATION_MAIL_DAILY_CAP, reserveLoginMail } from "./client-auth";
import { logFailure, logNote } from "./log";
import { mailConfigured, sendMail, type Env } from "./notify";
import { confirmSubscriber } from "./submit";
import { sha256 } from "./token";

// The newsletter after the sign-up (phase 2c, spec 5): where an address stands (the admin's drawer, Minu andmed), the confirmation
// link's work, and the welcome mail with Seaded's "Tervituskood". Without Next.js: the confirm route and the account API build the
// dependencies; the tests pass PGlite, an in-memory KV and a stubbed Resend.

/** An address's newsletter: confirmed ("yes"), waiting for its confirmation ("pending"), or no row ("no"). */
export type NewsletterState = "yes" | "pending" | "no";

/** The newsletter state of an address (a row may hold it in any case). */
export async function newsletterState(db: Q, email: string): Promise<NewsletterState> {
  const [row] = await db.select({ confirmedAt: subscribers.confirmedAt }).from(subscribers).where(sql`lower(${subscribers.email}) = ${normalizeEmail(email)}`).limit(1);
  return !row ? "no" : row.confirmedAt ? "yes" : "pending";
}

/** A client's address, language and newsletter state; null when the client is gone. */
export async function clientNewsletter(db: Db, clientId: number): Promise<{ email: string; locale: "et" | "ru"; state: NewsletterState } | null> {
  const [client] = await db.select({ email: clients.email, locale: clients.locale }).from(clients).where(eq(clients.id, clientId)).limit(1);
  return client ? { ...client, state: await newsletterState(db, client.email) } : null;
}

export type WelcomeDeps = { db: Db; env: Env; now: Date };

/** A welcome mail is sent to an address at most once in this many seconds (a KV mark under the hash of the address). */
const WELCOME_ONCE_SEC = 365 * 24 * 60 * 60;

/**
 * The welcome mail with the welcome code, after an address's first confirmation (spec 5). Never throws, and logs no address and no
 * code. No mail when: no code is set; the address is a sample one; Resend is not set up; the address had its welcome this year (a KV
 * mark, read first and written only once the day's quota has a place for the mail; a store that fails lets the mail go, as the other
 * limits do); the day's confirmation cap is reached (the mail_quota row, which never fails open — a capped day writes no mark, so a
 * later confirmation of that address can still bring it).
 */
export async function sendWelcome(deps: WelcomeDeps, to: { email: string; locale: string }): Promise<void> {
  try {
    const address = normalizeEmail(to.email);
    if (isSampleAddress(address) || !mailConfigured(deps.env)) return;
    const code = welcomeCodeOf(await readSetting(deps.db, "newsletter"));
    if (!code) return;
    const mark = `rl:welcome:${await sha256(address)}`;
    try {
      if (await deps.env.KV.get(mark)) {
        console.info("[newsletter] welcome e-mail sent to this address before: not again");
        return;
      }
    } catch (e) {
      logFailure("[newsletter] welcome mark unavailable, sending", e);
    }
    if (!(await reserveLoginMail(deps.db, deps.now, CONFIRMATION_MAIL_DAILY_CAP))) {
      logNote("[newsletter] daily mail cap reached: no welcome e-mail");
      return;
    }
    try {
      await deps.env.KV.put(mark, "1", { expirationTtl: WELCOME_ONCE_SEC });
    } catch (e) {
      logFailure("[newsletter] welcome mark not written", e);
    }
    const sent = await sendMail(deps.env, welcomeMail(address, code, to.locale === "ru" ? "ru" : "et"));
    console.info(`[newsletter] welcome e-mail sent: ${sent}`);
  } catch (e) {
    logFailure("[newsletter] welcome e-mail failed", e);
  }
}

/**
 * The confirmation link (/api/newsletter/confirm): the subscriber confirmed; on the first confirmation with a welcome code set, the
 * welcome mail after the response (`later`) and the code for the confirmed page (the redirect's fragment). A repeat confirmation
 * gives no code and sends nothing. `locale`: the subscriber's, for the home page it lands on.
 */
export async function confirmNewsletter(
  deps: WelcomeDeps & { later: (task: () => Promise<unknown>) => void },
  token: string,
): Promise<{ outcome: "kinnitatud" | "vigane"; locale: "et" | "ru"; code: string | null }> {
  const confirmed = await confirmSubscriber(deps.db, token, deps.now);
  if (!confirmed) return { outcome: "vigane", locale: "et", code: null };
  const locale = confirmed.sub.locale === "ru" ? "ru" : "et";
  if (!confirmed.first) return { outcome: "kinnitatud", locale, code: null };
  const code = welcomeCodeOf(await readSetting(deps.db, "newsletter"));
  if (!code) return { outcome: "kinnitatud", locale, code: null };
  const to = { email: confirmed.sub.email, locale };
  deps.later(() => sendWelcome(deps, to));
  return { outcome: "kinnitatud", locale, code };
}
```

  3. **`src/app/api/newsletter/confirm/route.ts`.** Replace the file with:

```ts
import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { welcomeFragment } from "@/domain/welcome-code";
import { serverEnv } from "@/server/env";
import { serverKv } from "@/server/kv";
import { logFailure } from "@/server/log";
import { confirmNewsletter } from "@/server/newsletter";

/**
 * Newsletter double opt-in: the link in the confirmation e-mail (`?t=<token>`). Confirms the subscriber and sends the visitor to the
 * home page in their language, which shows a notice: ?uudiskiri=kinnitatud (confirmed), =vigane (unknown token), =viga (the database
 * could not be reached). The first confirmation with a welcome code set (Seaded "Tervituskood", phase 2c) also mails the code after
 * the response and carries it in the fragment (#kood=<CODE>): the cached home page shows it from there, and no server or cache sees it.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let outcome: "kinnitatud" | "vigane" | "viga" = "vigane";
  let home = "/";
  let code: string | null = null;
  try {
    const result = await confirmNewsletter(
      {
        db: getDb(),
        env: { ...serverEnv(), KV: serverKv() },
        now: new Date(),
        later: (task) => after(() => task().catch((e) => logFailure("[newsletter] welcome e-mail failed", e))),
      },
      url.searchParams.get("t") ?? "",
    );
    outcome = result.outcome;
    if (result.locale === "ru") home = "/ru";
    code = result.code;
  } catch (e) {
    logFailure("[newsletter] confirm failed", e); // never the message: it would contain the token
    outcome = "viga";
  }
  const target = new URL(home, url.origin);
  target.searchParams.set("uudiskiri", outcome);
  if (code) target.hash = welcomeFragment(code);
  const res = NextResponse.redirect(target, 303);
  res.headers.set("cache-control", "no-store");
  return res;
}
```

  4. **`src/server/account-api.ts`.** Import `clientNewsletter` and `sendWelcome` from `./newsletter`. Replace the `newsletter` handler:

```ts
/**
 * POST /uudiskiri `{ on }`: the account's address subscribes (confirmed: the login proved it) or unsubscribes. 200 `{ ok: true }`. Switched
 * on and confirmed now for the first time: the welcome mail with Seaded's code after the response (phase 2c; server/newsletter.ts
 * sendWelcome: once per address, never in development, never to a sample address).
 */
async function newsletter(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parseNewsletter(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  const before = input.data.on ? await clientNewsletter(deps.db, session.clientId) : null;
  if (!(await setNewsletter(deps.db, session.clientId, input.data.on, deps.now))) return unauthorized("none");
  if (before && before.state !== "yes" && !deps.dev) deps.later(() => sendWelcome(deps, { email: before.email, locale: before.locale }));
  return clientResponse(session, { ok: true });
}
```

- [ ] **Step 8: The confirmed page.** In `app/[locale]/(site)/page.tsx`, the `kinnitatud` notice gets the line: `kinnitatud: { tone: "ok", title: nl.confirmedTitle, text: nl.confirmedText, codeLine: nl.codeLine },`. Extend the comment above it: "…the first confirmation carries the welcome code in the fragment (#kood=…), which the notice shows (phase 2c)."
- [ ] **Step 9: Seaded → "Tervituskood".**
  1. **`src/domain/site-editor.ts`:**

```ts
export type NewsletterDraft = { discountLabel: string; welcomeCode: string };
export const newsletterDraft = (value: unknown): NewsletterDraft => ({ discountLabel: str(obj(value).discountLabel), welcomeCode: str(obj(value).welcomeCode) });
```

  2. **`src/server/admin-site.ts`**, the `newsletter` part (import `isWelcomeCode`, `normalizeWelcomeCode`, `WELCOME_CODE_MAX` from `@/domain/welcome-code`):

```ts
  // the editor always sends welcomeCode; a body without it (an older page) keeps the stored one
  newsletter: part<{ discountLabel: string; welcomeCode?: string }>({
    tables: ["settings"],
    schema: z.object({ discountLabel: text(400), welcomeCode: text(400).optional() }),
    read: (q) => readSetting(q, "newsletter"),
    draft: newsletterDraft,
    check: (c, v, name) => {
      const discountLabel = c.plain(`${name}.discountLabel`, v.discountLabel, L.discount, { required: true });
      // "Tervituskood" (phase 2c): A–Z, 0–9 and "-", at most 30, stored in capitals; empty = no welcome code
      const welcomeCode = v.welcomeCode === undefined ? undefined : normalizeWelcomeCode(v.welcomeCode);
      if (welcomeCode !== undefined && welcomeCode.length > WELCOME_CODE_MAX) c.fail(`${name}.welcomeCode`, "tooLong");
      else if (welcomeCode !== undefined && !isWelcomeCode(welcomeCode)) c.fail(`${name}.welcomeCode`, "codeFormat");
      return (tx, stored) => setSetting(tx, "newsletter", { ...obj(stored), discountLabel, ...(welcomeCode === undefined ? {} : { welcomeCode }) });
    },
  }),
```

  3. **`src/components/admin/SettingsEditor.tsx`**, in the newsletter card:
     - The discount field's `onChange` becomes `(discountLabel) => d.set("newsletter", { ...d.draft.newsletter, discountLabel })`.
     - After it, add:

```tsx
            <TextField
              label={t.welcomeCode}
              value={d.draft.newsletter.welcomeCode}
              onChange={(welcomeCode) => d.set("newsletter", { ...d.draft.newsletter, welcomeCode })}
              maxLength={WELCOME_CODE_MAX}
              hint={t.welcomeCodeHint}
              error={d.err("newsletter.welcomeCode")}
              name="newsletter.welcomeCode"
            />
```

     (Import `WELCOME_CODE_MAX` from `@/domain/welcome-code`.)
  4. **`src/i18n/dict/admin.ts`**, in `settings`:
     - `lead` gains "…uudiskirja soodustus ja tervituskood, …".
     - After `discountHint`, add:

```ts
    welcomeCode: "Tervituskood",
    welcomeCodeHint: "Saadetakse tervituskirjas pärast uudiskirja kinnitamist ja näidatakse kinnituslehel; hüpikaknas seda ei näidata. Tühjaks jättes koodi ei saadeta. Tähed A–Z, numbrid ja sidekriips, kuni 30 märki.",
```

  5. **`tests/db/admin-site.test.ts`.**
     - In "a page or setting that is not stored yet loads empty and is created on save" (the describe "missing rows"), `expect(s.values.newsletter).toEqual({ discountLabel: "" });` becomes `expect(s.values.newsletter).toEqual({ discountLabel: "", welcomeCode: "" });`.
     - Append to the settings describe:

```ts
  test("Tervituskood: stored in capitals next to the discount; another shape or over 30 is refused; a save without it keeps it", async () => {
    const s = await loadSettings(db);
    const save = (value: object) => saveSettingsForm(db, form({ newsletter: { version: s.versions.newsletter, value } }));
    expect(fieldsOf(await save({ discountLabel: "10%", welcomeCode: "tere 10" }))).toEqual({ "newsletter.welcomeCode": "codeFormat" });
    expect(fieldsOf(await save({ discountLabel: "10%", welcomeCode: "A".repeat(31) }))).toEqual({ "newsletter.welcomeCode": "tooLong" });
    expect(await save({ discountLabel: "10%", welcomeCode: " tere-10 " })).toMatchObject({ ok: true });
    expect((await getSettings(db)).newsletter).toEqual({ discountLabel: "10%", welcomeCode: "TERE-10" });
    const t = await loadSettings(db);
    expect(await saveSettingsForm(db, form({ newsletter: { version: t.versions.newsletter, value: { discountLabel: "15%" } } }))).toMatchObject({ ok: true });
    expect((await getSettings(db)).newsletter).toEqual({ discountLabel: "15%", welcomeCode: "TERE-10" });
  });
```

     (`loadSettings` and `getSettings` are the file's imports; add them if missing.)
- [ ] **Step 10: Run** `npx vitest run` — green; tsc; lint.
- [ ] **Step 11: E2E.** In `tests/e2e/admin-site.spec.ts`'s "settings" describe, add a test. It changes `settings.newsletter`, so it uses `changing(["settings", { column: "key", value: "newsletter" }])`. Import `testEmail` and `onLocalDb`:

```ts
  test("Tervituskood: saved in Seaded; the first confirmation link lands on the home page with the code, the second without", async ({ page, context, visitorIp }, info) => {
    test.skip(phone(info), "desktop changes the newsletter setting");
    await changing(["settings", { column: "key", value: "newsletter" }]);
    await signIn(page, context, visitorIp);
    await page.goto("/admin/seaded");
    await adminReady(page);
    await page.getByRole("textbox", { name: "Tervituskood", exact: true }).fill("e2e-tere");
    await save(page);
    expect(await one((sql) => sql<{ code: string }[]>`select value->>'welcomeCode' as code from settings where key = 'newsletter'`)).toEqual({ code: "E2E-TERE" });
    const addr = testEmail("welcome", info.project.name);
    const token = "w".repeat(40) + info.project.name.slice(0, 3).padEnd(3, "x");
    await onLocalDb((sql) => sql`insert into subscribers (email, locale, token) values (${addr}, 'et', ${token})`, { marksPages: false });
    await page.goto(`/api/newsletter/confirm?t=${token}`);
    await expect(page.locator("[data-flash-code]")).toHaveText("Sinu tervituskood: E2E-TERE. Lisa kood registreerimisel lahtrisse „Sõnum“.");
    expect(new URL(page.url()).hash).toBe(""); // the fragment is gone from the address
    await page.goto(`/api/newsletter/confirm?t=${token}`);
    await expect(page.locator("[data-flash-notice]")).toHaveAttribute("data-flash-notice", "ok");
    await expect(page.locator("[data-flash-code]")).toHaveCount(0);
  });
```

     The local run has no `RESEND_API_KEY` (and the address is `example.com`), so no mail goes anywhere. The subscriber row is an `e2e-form-…` one, which `removeFormRows` deletes.
- [ ] **Step 12: Run** `npx playwright test admin-site forms home` (dev) — green.
- [ ] **Step 13: Commit.**

```bash
git add app/src/domain/welcome-code.ts app/src/server/newsletter.ts app/src/server/submit.ts app/src/app/api/newsletter/confirm/route.ts app/src/server/account-mail.ts app/src/server/account-api.ts app/src/components/site/FlashNotice.tsx "app/src/app/[locale]/(site)/page.tsx" app/src/domain/site-editor.ts app/src/server/admin-site.ts app/src/components/admin/SettingsEditor.tsx app/src/i18n/dict app/tests
git commit -m "feat(newsletter): the welcome code — mailed after the first confirmation, shown on the confirmed page, from Seaded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Consent on the registration forms, "Sõnum" on the group form, and the drawer's newsletter line

Spec section 6.
- **The consent box:** group registration, the individual-course request, the e-course purchase wish and the waitlist get an unticked checkbox, "Soovin MS LABi uudiseid ja pakkumisi". The contact form and the practice form do not.
- **Ticked:** after the form itself succeeds, the newsletter's own sign-up runs: an unconfirmed row and the confirmation mail, or nothing for a confirmed address. A failure there never fails the registration.
- **The admin's Õpilased drawer** says "Uudiskiri: jah / ootab kinnitust / ei".
- **"Sõnum" on the group form.** The welcome mail tells the student to write the code in "Sõnum", but today only the individual request has that field. The group registration — the usual one — gets the same optional "Sõnum" (`registrations.message` exists and the admin shows it). Maria's notification of a group registration shows it too.

**Files:**
- Modify: `app/src/server/forms.ts`, `app/src/server/submit.ts`, `app/src/server/messages.ts`
- Modify: `app/src/components/site/ContactRegister.tsx`, `PurchaseInterest.tsx`, `WaitlistForm.tsx`, `Calendar.module.css`
- Modify: `app/src/app/[locale]/(site)/koolitused/[slug]/page.tsx`, `ostukorv/cart.tsx`, `koolituskalender/page.tsx`
- Modify: `app/src/server/admin-clients.ts`, `app/src/components/admin/ClientDrawer.tsx`, `app/src/i18n/dict/admin.ts`, `et.ts`, `ru.ts`
- Test: `app/tests/unit/forms.test.ts`, `app/tests/db/actions.test.ts`, `app/tests/db/admin-clients.test.ts`, `app/tests/e2e/course.spec.ts`

**Interfaces:**
- Consumes: `newsletterState` (Task 9).
- Produces, from `src/server/forms.ts`: `wantsNewsletter: boolean` in the parsed group registration, individual request, purchase interest and waitlist (the form field `newsletter`, "on" when ticked); `message: string` in the parsed group registration (the field `message`, optional, ≤ 2000).
- Produces, from `src/server/submit.ts`: `Stored.subscribe?: { email: string; locale: "et" | "ru" }`, run after the response by `subscribeLater`; the internal `subscribeAddress(deps, email, locale): Promise<Mail | null>` shared with `handleSubscribe`.
- Produces, from `src/server/admin-clients.ts`: `ClientDetail.newsletter: NewsletterState`.
- Produces, in the dictionaries: `forms.newsletterConsent`; in admin, `clients.drawer.newsletter` and `clients.drawer.newsletterStates`.

- [ ] **Step 1: Write the failing tests.**
  1. **`tests/unit/forms.test.ts`.** Import `parsePurchaseInterest` and `parseWaitlist` if missing, and append:

```ts
describe("the newsletter consent and the group form's message (phase 2c)", () => {
  const fd = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const group = { course: "kulmud", session: "4", name: "Kati", email: "kati@example.com", phone: "+372 5555 5555", payment: "full", terms: "on", locale: "et" };

  test("'newsletter' ticked is wantsNewsletter true; absent false — on the group, individual, purchase and waitlist forms", () => {
    const g = parseGroupRegistration(fd({ ...group, newsletter: "on" }));
    expect(g.ok && g.data.wantsNewsletter).toBe(true);
    const g2 = parseGroupRegistration(fd(group));
    expect(g2.ok && g2.data.wantsNewsletter).toBe(false);
    const i = parseIndividual(fd({ course: "kulmud", name: "Kati", email: "kati@example.com", phone: "+372 5555 5555", period: "detsember", terms: "on", locale: "et", newsletter: "on" }));
    expect(i.ok && i.data.wantsNewsletter).toBe(true);
    const p = parsePurchaseInterest(fd({ course: "e-kulmud", email: "kati@example.com", locale: "ru", newsletter: "on" }));
    expect(p.ok && p.data.wantsNewsletter).toBe(true);
    const w = parseWaitlist(fd({ session: "4", name: "Kati", email: "kati@example.com", locale: "et" }));
    expect(w.ok && w.data.wantsNewsletter).toBe(false);
  });

  test("the group form's optional message: trimmed, at most 2000", () => {
    const g = parseGroupRegistration(fd({ ...group, message: "  Kood TERE10  " }));
    expect(g.ok && g.data.message).toBe("Kood TERE10");
    const none = parseGroupRegistration(fd(group));
    expect(none.ok && none.data.message).toBe("");
    expect(parseGroupRegistration(fd({ ...group, message: "x".repeat(2001) })).ok).toBe(false);
  });
});
```

  2. **`tests/db/actions.test.ts`.** Append (`setup`, `outbox`, `form`, `c`, `s` and `ids` are the file's):

```ts
describe("the newsletter consent on the registration forms (phase 2c)", () => {
  const groupFields = (email: string, extra: Record<string, string> = {}) => ({
    course: "kulmud", session: String(s.id), name: "Kati Tamm", email, phone: "+372 5555 5555", payment: "full", terms: "on", locale: "et", ...extra,
  });

  test("ticked on a group registration: the registration is stored, then an unconfirmed subscriber and the confirmation mail; the message is kept", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    expect(await handleRegistration(deps, form(groupFields("nl-reg@example.com", { newsletter: "on", message: "Kood TERE10" })))).toEqual({ ok: true });
    await flush();
    const [reg] = await db.select().from(registrations).where(eq(registrations.email, "nl-reg@example.com"));
    expect(reg.message).toBe("Kood TERE10");
    const [sub] = await db.select().from(subscribers).where(eq(subscribers.email, "nl-reg@example.com"));
    expect(sub).toMatchObject({ locale: "et", confirmedAt: null });
    expect(mails().filter((m) => m.to === "nl-reg@example.com").map((m) => m.subject)).toContain("Kinnita MS LABi uudiskirjaga liitumine");
  });

  test("not ticked: no subscriber; an address already confirmed: nothing new; on the waitlist and the purchase wish too", async () => {
    const { deps, flush } = setup({ secrets: true });
    outbox();
    await handleRegistration(deps, form(groupFields("nl-none@example.com")));
    await db.insert(subscribers).values({ email: "nl-done@example.com", token: "d1", confirmedAt: NOW });
    await handleWaitlist(deps, form({ session: String(ids.full), name: "Kati", email: "nl-done@example.com", locale: "et", newsletter: "on" }));
    await handlePurchaseInterest(deps, form({ course: "e-kulmud", email: "nl-cart@example.com", locale: "ru", newsletter: "on" }));
    await flush();
    const rows = await db.select({ email: subscribers.email, locale: subscribers.locale, confirmed: subscribers.confirmedAt }).from(subscribers);
    expect(rows.map((r) => r.email).sort()).toEqual(["nl-cart@example.com", "nl-done@example.com"]);
    expect(rows.find((r) => r.email === "nl-cart@example.com")).toMatchObject({ locale: "ru", confirmed: null });
  });

  test("a failure of the sign-up never fails the registration (it runs after the answer, and is only logged)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, flush } = setup();
    await db.execute(sql`alter table subscribers rename to subscribers_away`);
    try {
      expect(await handleRegistration(deps, form(groupFields("nl-fail@example.com", { newsletter: "on" })))).toEqual({ ok: true });
      await flush();
      expect(errors.mock.calls.flat().map(String).join("\n")).toContain("[forms] register: newsletter sign-up failed");
    } finally {
      await db.execute(sql`alter table subscribers_away rename to subscribers`);
    }
    expect(await db.select().from(registrations).where(eq(registrations.email, "nl-fail@example.com"))).toHaveLength(1);
  });

  test("a sample address (@example.test) ticked: its unconfirmed row, and no mail (as the forms' own confirmations)", async () => {
    const { mails } = outbox();
    const { deps, flush } = setup({ secrets: true });
    expect(await handleRegistration(deps, form(groupFields("nl-sample@example.test", { newsletter: "on" })))).toEqual({ ok: true });
    await flush();
    expect(await db.select({ email: subscribers.email, confirmed: subscribers.confirmedAt }).from(subscribers)).toEqual([{ email: "nl-sample@example.test", confirmed: null }]);
    expect(mails().filter((m) => m.to === "nl-sample@example.test")).toEqual([]);
  });
});
```

     (In `beforeEach` the file deletes registrations of `test@example.com` only. These tests use addresses of their own, and `beforeEach` deletes `subscribers` already. Add `await db.delete(registrations).where(sql\`email like 'nl-%'\`);` to `beforeEach`.)
  3. **`tests/db/admin-clients.test.ts`.** Import `subscribers` if missing, and append to the drawer's describe (`clientDetail` and the file's `client` helper):

```ts
  test("the drawer's newsletter line: yes, waiting for confirmation, or no (phase 2c)", async () => {
    const kati = await client("kati@example.test");
    expect((await clientDetail(db, kati.id, NOW))!.newsletter).toBe("no");
    await db.insert(subscribers).values({ email: "Kati@example.test", token: "n1" });
    expect((await clientDetail(db, kati.id, NOW))!.newsletter).toBe("pending");
    await db.update(subscribers).set({ confirmedAt: NOW });
    expect((await clientDetail(db, kati.id, NOW))!.newsletter).toBe("yes");
  });
```

- [ ] **Step 2: Run them — expect FAIL.**
- [ ] **Step 3: The forms' parsing** (`src/server/forms.ts`).
  1. `groupRegistrationFormSchema` gains `wantsNewsletter: flag,` and `message: z.string().trim().max(MAX.message).default(""),`.
  2. `individualSchema` gains `wantsNewsletter: flag,`.
  3. `purchaseInterestSchema` becomes `z.object({ course: slug, email, locale, wantsNewsletter: flag })`.
  4. `waitlistSchema` becomes `z.object({ session: id, name: line(MAX.name), email, locale, wantsNewsletter: flag })`.
  5. The field maps:
     - `contactCourseForm` gains `wantsNewsletter: "newsletter"`;
     - `parseGroupRegistration`'s map gains `message: "message"`;
     - `parsePurchaseInterest` uses `{ ...same("course", "email", "locale"), wantsNewsletter: "newsletter" }`;
     - `parseWaitlist` uses `{ ...same("session", "name", "email", "locale"), wantsNewsletter: "newsletter" }`.
     The doc comments of those four parsers list the `newsletter` field ("Soovin MS LABi uudiseid ja pakkumisi", phase 2c), and the group one `message`.
  6. Leave `contactCourseFields` and `registrationSchema` as they are: `RegistrationInput` is unchanged.
- [ ] **Step 4: The sign-up after a form** (`src/server/submit.ts`).
  1. `Stored` gains `subscribe?: { email: string; locale: "et" | "ru" }`.
  2. In `submission`, after `if (confirm) …`, add:

```ts
  if (out.subscribe) {
    const wish = out.subscribe;
    deps.later(() => subscribeLater(deps, form, wish));
  }
```

  3. Extract the newsletter's own sign-up from `handleSubscribe` and add the deferred runner (put both above `handleSubscribe`):

```ts
/**
 * The newsletter's sign-up of `email` (lower-cased by the forms): a new address is stored unconfirmed, an unconfirmed one gets a new
 * consent time; either gets the confirmation mail, at most 3 a day per address. A confirmed address: nothing. The mail to send, or null.
 */
async function subscribeAddress(deps: Deps, email: string, locale: "et" | "ru"): Promise<Mail | null> {
  const [created] = await deps.db
    .insert(subscribers)
    .values({ email, locale, token: newToken(), consentAt: deps.now, clientId: accountOf(normalizeEmail(email)) })
    .onConflictDoNothing({ target: subscribers.email })
    .returning();
  let sub: Subscriber | undefined = created;
  if (!sub) {
    const [existing] = await deps.db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1);
    if (!existing || existing.confirmedAt) return null;
    [sub] = await deps.db.update(subscribers).set({ consentAt: deps.now, locale }).where(eq(subscribers.id, existing.id)).returning();
  }
  if (!(await allowed(deps.env, `rl:confirm:${await sha256(email)}`, CONFIRM_MAILS_PER_DAY, 24 * 60 * 60))) {
    console.info("[forms] subscribe: confirmation e-mails for this address are paused for today");
    return null;
  }
  return confirmationMail(deps.siteUrl, sub);
}

/**
 * "Soovin MS LABi uudiseid ja pakkumisi" ticked on a registration form (phase 2c): the newsletter's own sign-up (subscribeAddress) after
 * the answer. A sample address (`@example.test`) gets its row and no mail, as the forms' own confirmations (sendConfirmation): the
 * live checks register one. Never throws: the registration is stored whatever happens here, and a failure is logged without the address.
 */
async function subscribeLater(deps: Deps, form: FormName, wish: { email: string; locale: "et" | "ru" }): Promise<void> {
  try {
    const mail = await subscribeAddress(deps, wish.email, wish.locale);
    if (!mail) return;
    if (isSampleAddress(wish.email)) {
      console.info(`[forms] ${form}: newsletter sign-up stored; confirmation e-mail skipped (sample address)`);
      return;
    }
    const sent = await sendMail(deps.env, mail);
    console.info(`[forms] ${form}: newsletter confirmation e-mail sent: ${sent}`);
  } catch (e) {
    logFailure(`[forms] ${form}: newsletter sign-up failed`, e);
  }
}

/**
 * Newsletter sign-up. The answer is always the same "check your inbox", so the form never tells whether an address
 * is already subscribed. A new address is stored unconfirmed and gets the confirmation link; an unconfirmed one gets
 * the same link again (new consent time); a confirmed one gets nothing.
 */
export function handleSubscribe(deps: Deps, formData: FormData): Promise<ActionResult> {
  return submission(deps, "subscribe", formData, parseSubscribe, async ({ email, locale }) => {
    const mail = await subscribeAddress(deps, email, locale);
    return mail ? { result: OK, mail } : { result: OK };
  });
}
```

  4. The four handlers take the wish out of the stored data and return it:
     - **`handleRegistration`:** the destructuring becomes `({ course: slug, courseSessionId, terms: _terms, wantsNewsletter, ...data })`. The registration keeps its message: `createRegistration(deps.db, { ...data, courseId: course.id, courseSessionId: session.id, kind: "group", preferredPeriod: "" })` (the explicit `message: ""` goes). The return becomes `{ result: OK, notify: { ...summary, replyTo: data.email }, confirm, subscribe: wantsNewsletter ? { email: data.email, locale: data.locale } : undefined }`.
     - **`handleIndividual`:** `({ course: slug, terms: _terms, wantsNewsletter, ...data })`, and the same `subscribe` in its return.
     - **`handlePurchaseInterest`:** `({ course: slug, email, locale, wantsNewsletter })`; its return gains `subscribe: wantsNewsletter ? { email, locale } : undefined`.
     - **`handleWaitlist`:** `({ session: sessionId, wantsNewsletter, ...data })`; its return gains `subscribe: wantsNewsletter ? { email: data.email, locale: data.locale } : undefined`.
  5. **`src/server/messages.ts`.** `registrationSummary`'s input type gains `message: string`, and its rows gain `["Sõnum", s.message, true],` after "Loo konto" (the third value skips an empty one, as in `individualSummary`).
- [ ] **Step 5: The drawer.**
  1. **`src/server/admin-clients.ts`.** Import `newsletterState` and `type NewsletterState` from `./newsletter`. `ClientDetail` gains `/** Her address's newsletter (phase 2c): confirmed, waiting for its confirmation, or none. */ newsletter: NewsletterState;`. In `clientDetail`, after `if (!client) return null;`, add `const newsletter = await newsletterState(db, client.email);`, and add `newsletter,` to the returned object.
  2. **`src/components/admin/ClientDrawer.tsx`.** After the `<p className={`${ui.muted} ${ui.small}`}>` line with `t.created`, add:

```tsx
        <p className={`${ui.muted} ${ui.small}`} data-client-newsletter={detail.newsletter}>
          {fill(t.newsletter, { state: t.newsletterStates[detail.newsletter] })}
        </p>
```

  3. **`src/i18n/dict/admin.ts`**, in `clients.drawer` after `created`:

```ts
      // her address's newsletter (phase 2c)
      newsletter: "Uudiskiri: {state}",
      newsletterStates: { yes: "jah", pending: "ootab kinnitust", no: "ei" },
```

- [ ] **Step 6: The forms' UI.**
  1. **Dictionaries**, in `forms` after `createAccount`:
     - `et.ts`: `newsletterConsent: "Soovin MS LABi uudiseid ja pakkumisi",` with the comment `// the registration forms' newsletter consent (phase 2c): unticked; ticked, the newsletter's own sign-up follows`;
     - `ru.ts`: `newsletterConsent: "Хочу получать новости и предложения MS LAB",`.
  2. **`ContactRegister.tsx`.**
     - `ContactRegisterTexts` gains `newsletterConsent: string`.
     - `checks` gains `newsletter: false`.
     - After the "account" checkbox label, add:

```tsx
            <label className={styles.check}>
              <input type="checkbox" name="newsletter" checked={checks.newsletter} onChange={(e) => setChecks((c) => ({ ...c, newsletter: e.target.checked }))} />
              <span>{t.newsletterConsent}</span>
            </label>
```

     - **"Sõnum" for the group too.** Move the message field out of the `kind === "individual"` block, so that it follows that block for both kinds: the individual block keeps only the period field, and the message `<div className={`${styles.field} ${styles.wide}`}>…</div>` comes right after the block's closing `)}`.
     - Extend the component's doc comment: "Both: help finding models (P11), create an account (P16), the newsletter consent and the optional message (phase 2c), terms."
  3. **`app/[locale]/(site)/koolitused/[slug]/page.tsx`.** In the `ContactRegister` texts, after `createAccount: d.forms.createAccount,`, add `newsletterConsent: d.forms.newsletterConsent,`.
  4. **`PurchaseInterest.tsx`.**
     - `t` gains `newsletterConsent: string`.
     - Import `checks from "./CourseBuy.module.css"`.
     - After the hidden inputs, add:

```tsx
      <label className={checks.check}>
        <input type="checkbox" name="newsletter" />
        <span>{t.newsletterConsent}</span>
      </label>
```

     - In `ostukorv/cart.tsx`, pass `newsletterConsent: d.forms.newsletterConsent`.
  5. **`WaitlistForm.tsx`.**
     - `WaitlistTexts` gains `newsletterConsent: string`.
     - Import `checks from "./CourseBuy.module.css"`.
     - After the e-mail field, add:

```tsx
      <label className={`${checks.check} ${styles.waitlistConsent}`}>
        <input type="checkbox" name="newsletter" />
        <span>{t.newsletterConsent}</span>
      </label>
```

     - In `Calendar.module.css`, after `.waitlistLead`, add `.waitlistConsent { grid-column: 1 / -1; }` (on its own lines, in the file's format).
     - In `koolituskalender/page.tsx`'s `waitlistForm` texts, add `newsletterConsent: d.forms.newsletterConsent,`.
- [ ] **Step 7: Run** `npx vitest run`, tsc and lint — green.
- [ ] **Step 8: E2E** (`tests/e2e/course.spec.ts`). In the test "form: payment options, models and account checkboxes, …", after the account checkbox check, add:

```ts
    await expect(form.getByLabel("Soovin MS LABi uudiseid ja pakkumisi")).not.toBeChecked(); // phase 2c: unticked
    await expect(form.getByLabel(/Sõnum/)).toBeVisible(); // the optional message, for the group too (the welcome code goes there)
```

     Then add, after "contact course group registration stays awaiting prepayment" (import `storedSubscriber` from `./fixtures`):

```ts
test("the newsletter consent ticked on a group registration: an unconfirmed subscriber follows; the message is the group's too (phase 2c)", async ({ page }, info) => {
  test.skip(!LOCAL_FIXTURES, "reads the local database");
  submitsForms();
  const addr = testEmail("register-nl", info.project.name);
  await page.goto("/koolitused/kulmumeistri-baaskoolitus");
  await page.getByRole("radio", { name: /Grupikoolitus/ }).check();
  await page.locator("[data-session]:not([aria-disabled='true'])").first().click();
  await page.getByLabel("Nimi").fill("Test Õpilane"); await page.getByLabel("E-post", { exact: true }).fill(addr); await page.getByLabel("Telefon").fill("+3725555555");
  await page.getByRole("radio", { name: /100%/ }).check(); await page.getByLabel(/tingimustega/).check();
  await page.getByLabel("Soovin MS LABi uudiseid ja pakkumisi").check();
  await page.getByLabel(/Sõnum/).fill("Kood E2E");
  await page.getByRole("button", { name: "Registreeru" }).click();
  await expect(page.getByText(/koht kinnitub pärast ettemaksu/)).toBeVisible();
  await expect.poll(() => storedSubscriber(addr)).toMatchObject({ email: addr, confirmed: false });
});
```
- [ ] **Step 9: Run** `npx playwright test course forms calendar catalogue admin-clients` (dev) — green.
- [ ] **Step 10: Commit.**

```bash
git add app/src/server/forms.ts app/src/server/submit.ts app/src/server/messages.ts app/src/components/site app/src/server/admin-clients.ts app/src/components/admin/ClientDrawer.tsx "app/src/app/[locale]/(site)" app/src/i18n/dict app/tests
git commit -m "feat(forms): newsletter consent on the registration forms; Sõnum on the group form; the drawer's newsletter line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: The password's storage — the rules, scrypt, set and remove, the login check

Spec section 7 (Data, Hash).
- **Hash:** `node:crypto` scrypt, N = 2^15, r = 8, p = 1, a 64-byte key and a 16-byte random salt, stored as `scrypt$15$8$1$<salt>$<key>` (base64url). Compared with `timingSafeEqual`. No new dependency.
  - Node's default `maxmem` (32 MiB) is exactly what N = 2^15, r = 8 needs, and OpenSSL refuses it as too little (`ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, checked on Node 22): the hash gives 64 MiB.
  - The password is NFC-normalised before hashing, so the same password typed with combining marks matches.
- **Rules** (shared by Minu andmed and the server): 10 … 200 characters (code points, as people count them), not the e-mail address.
- **Login check:** an unknown address, or one without a password, runs scrypt against a fixed dummy hash, so every failure takes the same time. The session it starts is the code's (`startSession`: the one-device rule).
  - Every attempt for one address runs under the address lock (`lockAddress`), together with the lock's counter that Task 12 hands in (`gate`). Attempts sent in parallel are then checked and counted one after another: none can pass the "5 failures" lock alongside the others. A counter read before the check and written after it, outside any lock, would let a burst of parallel attempts all see "below 5".

**Files:**
- Create: `app/src/domain/password.ts`, `app/src/server/password.ts`, `app/src/server/client-password.ts`
- Modify: `app/src/server/client-auth.ts` (`redeemClientPassword`), `app/src/server/account-input.ts` (`parsePassword`)
- Test: `app/tests/unit/password.test.ts` (new), `app/tests/unit/account-input.test.ts`, `app/tests/db/client-password.test.ts` (new)

**Interfaces:**
- Consumes: `clients.passwordHash`, `clients.passwordChangedAt` (Task 1).
- Produces, from `src/domain/password.ts`:
  - `PASSWORD_MIN = 10`, `PASSWORD_MAX = 200`;
  - `type PasswordProblem = "short" | "long" | "email"`;
  - `passwordProblem(password: string, email: string): PasswordProblem | null`.
- Produces, from `src/server/password.ts`:
  - `hashPassword(password: string, salt?: Buffer): Promise<string>`;
  - `verifyPassword(password: string, stored: string): Promise<boolean>`;
  - `const DUMMY_HASH: string`.
- Produces, from `src/server/client-password.ts`:
  - `type SetPasswordResult = { kind: "saved"; email: string; locale: "et" | "ru"; changedAt: Date } | { kind: "problem"; problem: PasswordProblem } | { kind: "gone" }`;
  - `setClientPassword(db: Db, clientId: number, password: string, now: Date): Promise<SetPasswordResult>`;
  - `removeClientPassword(db: Db, clientId: number): Promise<{ email: string; locale: "et" | "ru"; had: boolean } | null>`.
- Produces, from `src/server/client-auth.ts`:
  - `type PasswordGate = (t: Db) => { open(): Promise<boolean>; failed(): Promise<void> }` (the lock's counter, on the login's transaction `t`);
  - `redeemClientPassword(db: Db, email: string, password: string, now?: Date, gate?: PasswordGate): Promise<ClientLogin | "locked" | null>`.
- Produces, from `src/server/account-input.ts`: `parsePassword(body: unknown): Input<{ password: string }>` and `LIMITS.passwordInput = 800`.

- [ ] **Step 1: Write the failing unit tests.**
  1. **Create `tests/unit/password.test.ts`:**

```ts
import { describe, expect, test } from "vitest";
import { passwordProblem, PASSWORD_MAX, PASSWORD_MIN } from "@/domain/password";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/password";

// Phase 2c (spec 7): the optional password's hash (scrypt from node:crypto, N = 2^15, r = 8, p = 1, a 64-byte key, a 16-byte salt,
// `scrypt$15$8$1$<salt>$<key>` in base64url, compared in constant time) and its rules. The vector was computed with node:crypto's
// scrypt on these parameters (salt: 16 bytes of 7).

const VECTOR = "scrypt$15$8$1$BwcHBwcHBwcHBwcHBwcHBw$WqToJfstDtwnx_bEboLb0UvQAXO8St074XEbwjfx9mMSlSgfh3TJg5T36zMiIDJkJ_pGuHU4eVNSdMfifOREXg";
const SHAPE = /^scrypt\$15\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/;

describe("password hashes (scrypt)", () => {
  test("the stored form: a known vector, and a new random salt each time (both verify)", async () => {
    expect(await hashPassword("tere-tulemast-2026", Buffer.alloc(16, 7))).toBe(VECTOR);
    const a = await hashPassword("tere-tulemast-2026");
    const b = await hashPassword("tere-tulemast-2026");
    expect(a).toMatch(SHAPE);
    expect(a).not.toBe(b);
    expect([await verifyPassword("tere-tulemast-2026", a), await verifyPassword("tere-tulemast-2026", b)]).toEqual([true, true]);
  });

  test("the right password verifies; a wrong one, another case, an extra space or nothing does not", async () => {
    expect(await verifyPassword("tere-tulemast-2026", VECTOR)).toBe(true);
    for (const wrong of ["tere-tulemast-2025", "Tere-tulemast-2026", "tere-tulemast-2026 ", ""]) expect(await verifyPassword(wrong, VECTOR), wrong).toBe(false);
  });

  test("a malformed or foreign stored value is false, never an error and never more work than ours", async () => {
    const foreign = ["", "plain", VECTOR.replace("$15$", "$16$"), VECTOR.replace("$8$1$", "$1$1$"), VECTOR.slice(0, -2), `bcrypt${VECTOR.slice(6)}`, VECTOR.replace("BwcHBwcHBwcHBwcHBwcHBw", "Bw")];
    for (const stored of foreign) expect(await verifyPassword("tere-tulemast-2026", stored), stored).toBe(false);
  });

  test("a password typed with combining marks is the same password as the composed one (NFC)", async () => {
    // written with escapes, so that no editor or tool can normalise the two spellings into one (the test could not fail then)
    const stored = await hashPassword("M\u00f5\u00f5dulint-123"); // õ as one code point
    expect(await verifyPassword("Mo\u0303o\u0303dulint-123", stored)).toBe(true); // o and the combining tilde, twice
  });

  test("the dummy hash has today's shape and matches no likely password", async () => {
    expect(DUMMY_HASH).toMatch(SHAPE);
    for (const guess of ["", "password", "tere-tulemast-2026", "0123456789"]) expect(await verifyPassword(guess, DUMMY_HASH), guess).toBe(false);
  });
});

describe("the password rules (Minu andmed and the server)", () => {
  test("10 … 200 characters, counted as people count them; not the account's e-mail address", () => {
    expect([PASSWORD_MIN, PASSWORD_MAX]).toEqual([10, 200]);
    expect(passwordProblem("123456789", "kati@example.test")).toBe("short");
    expect(passwordProblem("1234567890", "kati@example.test")).toBeNull();
    expect(passwordProblem("õ".repeat(10), "kati@example.test")).toBeNull();
    expect(passwordProblem("😀".repeat(9), "kati@example.test")).toBe("short"); // 9 characters, 18 UTF-16 units
    expect(passwordProblem("x".repeat(200), "kati@example.test")).toBeNull();
    expect(passwordProblem("x".repeat(201), "kati@example.test")).toBe("long");
    expect(passwordProblem(" KATI@example.test ", "kati@example.test")).toBe("email");
  });
});
```

  2. **`tests/unit/account-input.test.ts`.** Import `parsePassword` and append:

```ts
test("parsePassword (phase 2c): any string the database can store, 1 … 800 UTF-16 units, kept exactly as typed; the length rule is the server's (domain/password.ts)", () => {
  expect(parsePassword({ password: " pikk-parool-2026 " })).toEqual({ ok: true, data: { password: " pikk-parool-2026 " } });
  for (const body of [{ password: "" }, { password: 12345678901 }, { password: "x".repeat(801) }, { password: "a\u0000b".repeat(4) }, {}])
    expect(parsePassword(body)).toEqual({ ok: false, error: "password" });
  expect(parsePassword(null)).toEqual({ ok: false, error: "body" });
});
```

- [ ] **Step 2: Run them — expect FAIL**: the modules do not exist.
- [ ] **Step 3: Implement the pure parts.**
  1. **Create `src/domain/password.ts`:**

```ts
// The rules of the optional client password (phase 2c, spec 7), shared by Minu andmed (the browser) and the server. Pure.

/** The shortest and the longest password, in characters as people count them (code points). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** What is wrong with a new password: too short, too long, or the account's own e-mail address. */
export type PasswordProblem = "short" | "long" | "email";

/** The problem with `password` as the password of the account `email`, or null when it is fine. */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return "short";
  if (length > PASSWORD_MAX) return "long";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "email";
  return null;
}
```

  2. **Create `src/server/password.ts`:**

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// The optional client password's hash (phase 2c, spec 7): scrypt from node:crypto (no dependency) with N = 2^15, r = 8, p = 1, a
// 64-byte key and a 16-byte random salt, stored as `scrypt$15$8$1$<salt>$<key>` (base64url) and compared with timingSafeEqual. About
// 80 ms and 32 MiB a hash. The password is NFC-normalised first: the same letters typed with combining marks are the same password.

const LOG_N = 15;
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
/** scrypt needs 128 · N · r bytes (32 MiB here); Node's default limit is exactly that, which OpenSSL refuses as too little. */
const MAX_MEM = 64 * 1024 * 1024;
const STORED = /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/;

/**
 * A hash nobody's password matches (made from a random password that was thrown away): checked when an address has no password, or
 * no account, so that a login takes as long whether or not the address exists or has one.
 */
export const DUMMY_HASH = "scrypt$15$8$1$lCc8-6rYvD2U2LCtaJP3HA$n3Y4HKEJRU7WwatuhJ3L-cWLcTQ5y39QRQvnb5FbgL_DwAeh6p8b_GjzIeLYBloWmheoPJZ4cy4eaHr_tbiJYw";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, KEY_BYTES, { N: 2 ** LOG_N, r: R, p: P, maxmem: MAX_MEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** The stored form of `password`: a new random salt, unless one is given (the tests' known vector). */
export async function hashPassword(password: string, salt: Buffer = randomBytes(SALT_BYTES)): Promise<string> {
  const key = await derive(password, salt);
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Does `password` match `stored`? false for a value of another shape or other parameters: never an error, never more work than ours. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = STORED.exec(stored);
  if (!m || Number(m[1]) !== LOG_N || Number(m[2]) !== R || Number(m[3]) !== P) return false;
  const salt = Buffer.from(m[4], "base64url");
  const expected = Buffer.from(m[5], "base64url");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  return timingSafeEqual(await derive(password, salt), expected);
}
```

  3. **`src/server/account-input.ts`.**
     - `LIMITS` gains `passwordInput: 800`. The file's top comment gains "a password 1 … 800 UTF-16 units (the 10 … 200 characters rule is domain/password.ts, checked with the account's address)".
     - After `progress`, add `const password = z.object({ password: z.string().min(1).max(LIMITS.passwordInput).refine(storable) });`.
     - After `parseProgress`, add `export const parsePassword = (body: unknown) => parse(password, body);`.
- [ ] **Step 4: Run** the unit tests — expect PASS.
- [ ] **Step 5: Write the failing DB test.** Create `tests/db/client-password.test.ts`:

```ts
import { eq, isNull } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { clients, clientSessions } from "@/db/schema";
import { redeemClientPassword } from "@/server/client-auth";
import { removeClientPassword, setClientPassword } from "@/server/client-password";
import { DUMMY_HASH, verifyPassword } from "@/server/password";
import { makeTestDb } from "./helpers";

// Phase 2c (spec 7): the optional password in the database — set, changed and removed (only the scrypt hash and the time are kept), and
// the login check, which starts the code's own session (one device) and runs scrypt against the dummy hash when there is no password
// to check (the spy below sees it), so an unknown address takes as long as a wrong password.

vi.mock("@/server/password", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/password")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

const NOW = new Date("2026-10-08T10:00:00Z");
let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
  vi.mocked(verifyPassword).mockClear();
});
const kati = async () => (await db.insert(clients).values({ email: "kati@example.test", locale: "ru" }).returning())[0];

test("setClientPassword keeps the scrypt hash and the time, never the password; refuses a short, a long and the e-mail itself; a gone client", async () => {
  const c = await kati();
  expect(await setClientPassword(db, c.id, "lühike", NOW)).toEqual({ kind: "problem", problem: "short" });
  expect(await setClientPassword(db, c.id, "x".repeat(201), NOW)).toEqual({ kind: "problem", problem: "long" });
  expect(await setClientPassword(db, c.id, "Kati@Example.test", NOW)).toEqual({ kind: "problem", problem: "email" });
  expect((await db.select().from(clients))[0].passwordHash).toBeNull();
  expect(await setClientPassword(db, c.id, "pikk-parool-2026", NOW)).toEqual({ kind: "saved", email: "kati@example.test", locale: "ru", changedAt: NOW });
  const [row] = await db.select().from(clients);
  expect(row.passwordHash).toMatch(/^scrypt\$15\$8\$1\$/);
  expect(row.passwordHash).not.toContain("pikk-parool-2026");
  expect(row.passwordChangedAt).toEqual(NOW);
  expect(await setClientPassword(db, 987654, "pikk-parool-2026", NOW)).toEqual({ kind: "gone" });
});

test("removeClientPassword clears the hash and the time and says whether there was one", async () => {
  const c = await kati();
  expect(await removeClientPassword(db, c.id)).toEqual({ email: "kati@example.test", locale: "ru", had: false });
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  expect(await removeClientPassword(db, c.id)).toEqual({ email: "kati@example.test", locale: "ru", had: true });
  expect((await db.select().from(clients))[0]).toMatchObject({ passwordHash: null, passwordChangedAt: null });
  expect(await removeClientPassword(db, 987654)).toBeNull();
});

test("redeemClientPassword: the right password starts a session and ends the other one (one device); a wrong one is null", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  expect(await redeemClientPassword(db, " KATI@example.test ", "pikk-parool-2026", NOW)).toMatchObject({ clientId: c.id, locale: "ru", isNew: false });
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", new Date(NOW.getTime() + 1000))).toMatchObject({ clientId: c.id });
  const sessions = await db.select().from(clientSessions).where(eq(clientSessions.clientId, c.id));
  expect(sessions).toHaveLength(2);
  expect(await db.select().from(clientSessions).where(isNull(clientSessions.endedAt))).toHaveLength(1);
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2025", NOW)).toBeNull();
});

test("an unknown address and one without a password run scrypt against the dummy hash (as long as a wrong password), and are null; no session", async () => {
  await kati();
  const verify = vi.mocked(verifyPassword);
  expect(await redeemClientPassword(db, "keegi@example.test", "pikk-parool-2026", NOW)).toBeNull();
  expect(verify).toHaveBeenLastCalledWith("pikk-parool-2026", DUMMY_HASH);
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW)).toBeNull(); // she has no password
  expect(verify).toHaveBeenLastCalledWith("pikk-parool-2026", DUMMY_HASH);
  expect(verify).toHaveBeenCalledTimes(2);
  expect(await db.select().from(clientSessions)).toEqual([]);
});

test("the gate (Task 12's lock), asked under the address lock: shut, nothing is checked and nothing counted; open, a failure is counted and a success is not", async () => {
  const c = await kati();
  await setClientPassword(db, c.id, "pikk-parool-2026", NOW);
  const counted: string[] = [];
  const gate = (open: boolean) => () => ({ open: async () => open, failed: async () => void counted.push("failed") });
  const verify = vi.mocked(verifyPassword);
  verify.mockClear();
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, gate(false))).toBe("locked");
  expect(verify).not.toHaveBeenCalled();
  expect(counted).toEqual([]);
  expect(await redeemClientPassword(db, "kati@example.test", "vale-parool-2026", NOW, gate(true))).toBeNull();
  expect(await redeemClientPassword(db, "kati@example.test", "pikk-parool-2026", NOW, gate(true))).toMatchObject({ clientId: c.id });
  expect(counted).toEqual(["failed"]);
});
```

- [ ] **Step 6: Run it — expect FAIL.**
- [ ] **Step 7: Implement the database side.**
  1. **Create `src/server/client-password.ts`:**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { clients } from "@/db/schema";
import { passwordProblem, type PasswordProblem } from "@/domain/password";
import { hashPassword } from "./password";

// The optional client password (phase 2c, spec 7), set, changed and removed from Minu andmed (account-api.ts). The client is always the
// session's. Only the scrypt hash (server/password.ts) and the time of the last change ("muudetud {date}") are stored.

export type SetPasswordResult =
  | { kind: "saved"; email: string; locale: "et" | "ru"; changedAt: Date }
  | { kind: "problem"; problem: PasswordProblem }
  | { kind: "gone" };

/** Sets or changes the client's password, checked against the rules with her address (domain/password.ts). "gone": no such client. */
export async function setClientPassword(db: Db, clientId: number, password: string, now: Date): Promise<SetPasswordResult> {
  const [client] = await db.select({ email: clients.email, locale: clients.locale }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { kind: "gone" };
  const problem = passwordProblem(password, client.email);
  if (problem) return { kind: "problem", problem };
  const passwordHash = await hashPassword(password);
  const rows = await db.update(clients).set({ passwordHash, passwordChangedAt: now }).where(eq(clients.id, clientId)).returning();
  return rows.length ? { kind: "saved", email: client.email, locale: client.locale, changedAt: now } : { kind: "gone" };
}

/** Removes the client's password (the code works as always). `had`: there was one (only then is the change mailed). null: no such client. */
export async function removeClientPassword(db: Db, clientId: number): Promise<{ email: string; locale: "et" | "ru"; had: boolean } | null> {
  const [client] = await db.select({ email: clients.email, locale: clients.locale, hash: clients.passwordHash }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;
  if (client.hash !== null) await db.update(clients).set({ passwordHash: null, passwordChangedAt: null }).where(eq(clients.id, clientId));
  return { email: client.email, locale: client.locale, had: client.hash !== null };
}
```

  2. **`src/server/client-auth.ts`.** Import `DUMMY_HASH` and `verifyPassword` from `./password`. After `redeemClientCode`, add:

```ts
/**
 * The password login's lock for one address (account-api.ts passwordLogin, phase 2c): its counter, on the login's transaction `t`.
 * `open()`: may this attempt be checked; `failed()`: count it as a failure.
 */
export type PasswordGate = (t: Db) => { open(): Promise<boolean>; failed(): Promise<void> };

/**
 * The session for an e-mail and the password set in Minu andmed (phase 2c); null: an unknown address, no password set and a wrong
 * password alike; "locked": the gate is shut. Everything runs in one transaction under the address lock, so the attempts for one
 * address go one after another, and attempts sent in parallel cannot pass the gate together: the gate is asked first (a locked
 * attempt checks nothing and counts nothing), then scrypt runs every time — against a fixed dummy hash when there is no password to
 * check — so the answer takes as long whatever the address, and a failure is counted before the lock is let go. The session is the
 * code's (startSession: the one-device rule). Never a new client.
 */
export async function redeemClientPassword(db: Db, email: string, password: string, now = new Date(), gate?: PasswordGate): Promise<ClientLogin | "locked" | null> {
  const address = normalizeEmail(email);
  return tx(db, async (t) => {
    await lockAddress(t, address);
    const lock = gate?.(t);
    if (lock && !(await lock.open())) return "locked";
    const [row] = await t.select({ hash: clients.passwordHash }).from(clients).where(eq(clients.email, address)).limit(1);
    const stored = row?.hash ?? null;
    const matches = await verifyPassword(password, stored ?? DUMMY_HASH);
    if (matches && stored !== null) return startSession(t, address, now);
    await lock?.failed();
    return null;
  });
}
```

- [ ] **Step 8: Run** `npx vitest run tests/db/client-password.test.ts tests/unit/password.test.ts tests/unit/account-input.test.ts`, then the whole `npx vitest run`, tsc and lint — green.
- [ ] **Step 9: Commit.**

```bash
git add app/src/domain/password.ts app/src/server/password.ts app/src/server/client-password.ts app/src/server/client-auth.ts app/src/server/account-input.ts app/tests/unit/password.test.ts app/tests/unit/account-input.test.ts app/tests/db/client-password.test.ts
git commit -m "feat(account): optional password storage — scrypt from node:crypto, the rules, set/remove, the login check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The password API — the login with its lock, set and remove, the mails, `passwordSetAt`

Spec section 7 (Login, API).
- **`POST /api/konto/parool-login {email, password}`** → `startSession`, the one-device rule as for the code. Same-origin POST, `private, no-store`.
- **Every failure gets one answer**, "E-post või parool ei sobi.": unknown address, no password set and wrong password alike, with the timing of Task 11.
- **The lock:** 5 failures per address or 20 per IP in 15 minutes, in the Postgres KV store → "Liiga palju katseid. …". Failures count whether or not the address exists. A locked attempt is refused before anything is checked and is not counted, so the lock ends 15 minutes after the last failure.
  - The address's counter is read and written under the address lock, in the login's own transaction (Task 11's `gate`, on a `PgKv` of that transaction). Attempts sent in parallel are checked and counted one after another, so no burst passes the 5. The store inside the transaction does not sweep (`sweep: false`): a sweep there would hold expired rows' locks until the commit and could deadlock with another login's.
  - The IP's counter is the forms' kind (read, then written, outside any lock): a burst can pass a few more than 20. It guards against spraying many addresses, each of which keeps its own exact 5.
- **Set and remove**, both behind `requireClient` + `clientResponse`:
  - `POST /api/konto/parool {password}` sets or changes it (5 changes an hour: each one mails her).
  - `DELETE /api/konto/parool` removes it.
  - Each set, change or removal mails "Sinu MS LABi konto parool on muudetud." (ET/RU) with a line to write to Maria if it was not her. The current session goes on.
- **`passwordSetAt`.** The spec names `GET /api/konto/andmed`, but there is no such endpoint: Minu andmed reads the dashboard (`GET /api/konto`), whose `client` is the profile. So `passwordSetAt` goes there.

**Files:**
- Modify: `app/src/server/account-api.ts`, `app/src/app/api/konto/[[...path]]/route.ts`, `app/src/server/ratelimit.ts`, `app/src/server/kv.ts` (`sweep: false`), `app/src/server/client-data.ts`, `app/src/server/account-mail.ts`, `app/src/lib/json-request.ts`
- Modify: `app/src/i18n/dict/et.ts`, `ru.ts` (`account.passwordMail`)
- Test: `app/tests/unit/ratelimit.test.ts`, `app/tests/unit/account-api.test.ts`, `app/tests/unit/account-guards.test.ts`, `app/tests/unit/account-mail.test.ts`, `app/tests/db/kv.test.ts`, `app/tests/db/password-api.test.ts` (new)
- Update (`passwordSetAt: null` in the profile): `app/tests/unit/account-dashboard-dom.test.ts`, `account-dashboard.test.ts`, `account-readonly.test.ts`, `account-types.test.ts`, `account-details-dom.test.ts`, `app/tests/db/client-data.test.ts`, `app/tests/db/account-api.test.ts`

**Interfaces:**
- Consumes: `redeemClientPassword` with its `PasswordGate`, `setClientPassword`, `removeClientPassword`, `parsePassword` (Task 11).
- Produces, from `src/server/kv.ts`: `new PgKv(db, now?, opts?: { sweep?: boolean })` (`sweep: false`: a store inside a caller's transaction, whose puts do not sweep).
- Produces, from `src/server/ratelimit.ts`:
  - `belowLimit(kv: TextKv, key: string, limit: number): Promise<boolean>`;
  - `countFailure(kv: TextKv, key: string, windowSec: number): Promise<void>`.
- Produces, from `src/server/account-api.ts`:
  - `POST /parool-login` → 200 `{ ok: true, locale }` + cookies, 400 `{ error: "password" }` or 429 `{ error: "locked" }`;
  - `POST /parool` → 200 `{ ok: true, passwordSetAt }`, 400 `{ error: "password" | "short" | "long" | "email" }` or 429 `{ error: "rate" }`;
  - `DELETE /parool` → 200 `{ ok: true }`.
- Produces, from `src/server/client-data.ts`: `ClientProfile.passwordSetAt: string | null` (ISO).
- Produces, from `src/server/account-mail.ts`: `passwordChangedMail(email: string, locale: Locale, contactEmail: string): Mail`.
- Produces, from `src/lib/json-request.ts`: `sendJson`'s `method` takes `"DELETE"`.

- [ ] **Step 1: Write the failing unit tests.**
  1. **`tests/unit/ratelimit.test.ts`.** Import `belowLimit` and `countFailure`, and append:

```ts
test("the password lock's counters (phase 2c): belowLimit counts nothing; countFailure adds one and starts the window again", async () => {
  const kv = fakeKv();
  expect(await belowLimit(kv, "k", 2)).toBe(true);
  await countFailure(kv, "k", 900);
  await countFailure(kv, "k", 900);
  expect([kv.store.get("k"), kv.ttl.get("k")]).toEqual(["2", 900]);
  expect(await belowLimit(kv, "k", 2)).toBe(false);
  expect(await belowLimit(kv, "k", 3)).toBe(true);
});
```

  2. **`tests/unit/account-guards.test.ts`.**
     - In both handler lists, insert `"setPassword", "removePassword"` after `"newsletter"`.
     - In the router's expected cases, insert `"POST /parool setPassword", "DELETE /parool removePassword"` after `"POST /uudiskiri newsletter"`.
  3. **`tests/unit/account-api.test.ts`.**
     - In "an unknown path or method …", add `req("/parool"), req("/parool", { method: "PATCH" }), req("/parool-login")` to the `unknown` list.
     - In "the data endpoints without a session", add `["POST", "/parool", { password: "pikk-parool-2026" }], ["DELETE", "/parool"],` to `endpoints`.
     - Append:

```ts
describe("the password login without a database (phase 2c)", () => {
  test("a body that cannot be a login: the same 400 { error: 'password' } as a wrong password, private, before the database", async () => {
    for (const body of [{}, { email: "kati@example.test" }, { email: "pole-aadress", password: "pikk-parool-2026" }, { password: "pikk-parool-2026" }, "not json"]) {
      const res = (await handleAccountApi(post("/parool-login", body), deps()))!;
      expect([res.status, await res.json()], JSON.stringify(body)).toEqual([400, { ok: false, error: "password" }]);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});
```

  4. **`tests/unit/account-mail.test.ts`.** Import `passwordChangedMail` and append:

```ts
describe("the password changed mail (phase 2c)", () => {
  test("the line, and whom to write to if it was not her: Maria's address when the contact setting has one", () => {
    const mail = passwordChangedMail("kati@example.test", "et", "info@mslab.ee");
    expect(mail.subject).toBe("MS LABi konto parool on muudetud");
    expect(mail.text).toBe(["Tere!", "", "Sinu MS LABi konto parool on muudetud.", "Kui see polnud sina, kirjuta kohe Mariale: info@mslab.ee", "", "MS LAB Koolituskeskus"].join("\n"));
    expect(passwordChangedMail("kati@example.test", "et", "").text).toContain("Kui see polnud sina, kirjuta kohe Mariale.");
    expect(mail.html).toContain("Sinu MS LABi konto parool on muudetud.");
  });

  test("Russian", () => {
    const mail = passwordChangedMail("kati@example.test", "ru", "info@mslab.ee");
    expect(mail.subject).toBe("Пароль кабинета MS LAB изменён");
    expect(mail.text).toContain("Если это были не вы, сразу напишите Марии: info@mslab.ee");
  });
});
```

- [ ] **Step 2: Run them — expect FAIL.**
- [ ] **Step 3: The pieces.**
  1. **`src/server/ratelimit.ts`.** After `rateLimit`, add:

```ts
/** Is the count under `key` below `limit`? Counts nothing: the password lock checks before it tries, and counts failures only (phase 2c). */
export async function belowLimit(kv: TextKv, key: string, limit: number): Promise<boolean> {
  return Number((await kv.get(key)) ?? "0") < limit;
}

/** One more under `key`. Its window (`windowSec`) starts again with each one, so a lock ends `windowSec` after the last failure. */
export async function countFailure(kv: TextKv, key: string, windowSec: number): Promise<void> {
  const n = Number((await kv.get(key)) ?? "0");
  await kv.put(key, String(n + 1), { expirationTtl: windowSec });
}
```

  2. **Dictionaries**, in `account`, after `deleted`:
     - `et.ts`:

```ts
    // The mail after the password was set, changed or removed (account-mail.ts passwordChangedMail, phase 2c): {email} is Maria's
    // address from Seaded (the contact), `notYou` the line without one.
    passwordMail: {
      subject: "MS LABi konto parool on muudetud",
      line: "Sinu MS LABi konto parool on muudetud.",
      notYou: "Kui see polnud sina, kirjuta kohe Mariale.",
      notYouAt: "Kui see polnud sina, kirjuta kohe Mariale: {email}",
    },
```

     - `ru.ts`:

```ts
    passwordMail: {
      subject: "Пароль кабинета MS LAB изменён",
      line: "Пароль вашего кабинета MS LAB изменён.",
      notYou: "Если это были не вы, сразу напишите Марии.",
      notYouAt: "Если это были не вы, сразу напишите Марии: {email}",
    },
```

  3. **`src/server/account-mail.ts`.** After `deletionMail`, add:

```ts
/**
 * The mail after the account's password was set, changed or removed (phase 2c): the line, and whom to write to if it was not her
 * (`contactEmail`, Seaded's contact address; "" for none). Plain text and a plain HTML body, no button. The caller never sends it to
 * a sample address or in development.
 */
export function passwordChangedMail(email: string, locale: Locale, contactEmail: string): Mail {
  const dict = getDict(locale).account;
  const p = dict.passwordMail;
  const notYou = contactEmail ? fill(p.notYouAt, { email: contactEmail }) : p.notYou;
  const text = [dict.mail.greeting, "", p.line, notYou, "", dict.mail.signature].join("\n");
  const html = mailCard(p.subject, locale, [greetingRow(dict.mail.greeting), paragraphRow(p.line), paragraphRow(notYou, 8), signatureRow(dict.mail)]);
  return { to: email, subject: p.subject, text, html };
}
```

  4. **`src/lib/json-request.ts`.** `opts: { method?: "POST" | "PATCH" | "DELETE"; fetch?: typeof fetch }`.
  5. **`src/app/api/konto/[[...path]]/route.ts`.** After `export const PATCH = answer;`, add `export const DELETE = answer; // phase 2c: DELETE /parool`.
  6. **`src/server/kv.ts`.** `PgKv`'s constructor gains a third parameter, `private readonly opts: { sweep?: boolean } = {}`, and `put` sweeps only when `this.opts.sweep !== false` (`if (expiresAt && this.opts.sweep !== false) await this.sweep();`). Add to `put`'s doc comment: "`sweep: false` (a store on a caller's transaction: the password lock, account-api.ts): no sweep, which would hold the expired rows' locks until that transaction ends and could deadlock with another login's; the next put elsewhere, or the daily cron, sweeps." Then append to `tests/db/kv.test.ts`:

```ts
test("sweep: false (a store on a caller's transaction) writes its own row and leaves the expired ones to the next sweep", async () => {
  const db = await makeTestDb();
  await new PgKv(db, () => new Date("2026-10-02T10:00:00Z")).put("old", "x", { expirationTtl: 60 });
  const later = new PgKv(db, () => new Date("2026-10-02T11:00:00Z"), { sweep: false });
  await later.put("rl:pw-mail:abc", "1", { expirationTtl: 900 });
  expect(await physicalKeys(db)).toEqual(["old", "rl:pw-mail:abc"]);
  expect([await later.get("old"), await later.get("rl:pw-mail:abc")]).toEqual([null, "1"]);
});
```

- [ ] **Step 4: The endpoints** (`src/server/account-api.ts`).
  1. Imports:
     - `readSetting` from `@/db/queries/public`;
     - `parsePassword` (with the other parsers);
     - `redeemClientPassword` and `type PasswordGate` from `./client-auth`;
     - `PgKv` from `./kv`;
     - `removeClientPassword` and `setClientPassword` from `./client-password`;
     - `passwordChangedMail` from `./account-mail`;
     - `belowLimit` and `countFailure` from `./ratelimit`;
     - `sha256` from `./token`;
     - `type Locale` is imported already.
  2. With the other constants, after `PROGRESS_PER_MINUTE`, add:

```ts
/** Failed password logins per address, and per IP, within PASSWORD_LOCK_SEC before the lock (phase 2c, spec 7). */
const PASSWORD_FAILURES_PER_ADDRESS = 5;
const PASSWORD_FAILURES_PER_IP = 20;
const PASSWORD_LOCK_SEC = 15 * 60;
/** Password changes a client may make per hour: each one mails her. */
const PASSWORD_CHANGES_PER_HOUR = 5;
```

  3. In the file's top comment, extend the sign-in paragraph: "POST parool-login ({ email, password, locale }) does the same with the password set in Minu andmed (phase 2c): one answer for every failure, and a lock after 5 failures for an address or 20 from an IP in 15 minutes." Add to the list of endpoints behind a session: "POST /parool and DELETE /parool the optional password (each change mailed)".
  4. After the `code` handler, add:

```ts
/** The KV key of the password lock for this IP (rateKey "pw-ip"); null without an address (never on Vercel; `next dev` uses "local"). */
function passwordIpKey(request: Request, deps: AccountDeps): string | null {
  const ip = clientIp(request.headers) ?? (deps.dev ? "local" : null);
  return ip === null ? null : rateKey("pw-ip", ip);
}

/**
 * POST /parool-login `{ email, password, locale? }` (phase 2c): the e-mail and the password set in Minu andmed start the session as a code
 * does (the one-device rule): 200 `{ ok: true, locale }` + cookies. Every failure — unknown address, no password, wrong password, a body
 * that cannot be a login — is the same 400 `{ error: "password" }` ("E-post või parool ei sobi."), and takes as long (client-auth.ts
 * redeemClientPassword). After 5 failures for an address or 20 from an IP within 15 minutes: 429 `{ error: "locked" }`, the right
 * password too, until 15 minutes after the last failure (a locked attempt is not counted). Failures count whether or not the address
 * exists. The address's counter (a KV row under the address's hash) is read and counted under the address lock, in the login's own
 * transaction (the gate): attempts sent in parallel go one after another, and none passes the 5 alongside the others; a database
 * failure there fails the login (500), never opens the lock. The IP's counter is the forms' kind, read and then written (a burst can
 * pass a few more than 20), and a store that fails lets the attempt through, as the other limits.
 */
async function passwordLogin(request: Request, deps: AccountDeps): Promise<Response> {
  const body = await readObject(request);
  const address = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" && body.password.length <= LIMITS.passwordInput ? body.password : "";
  const locked = () => {
    logNote("[account] password login locked");
    return accountResponse({ ok: false, error: "locked" }, 429);
  };
  const ipKey = passwordIpKey(request, deps);
  try {
    if (ipKey !== null && !(await belowLimit(deps.env.KV, ipKey, PASSWORD_FAILURES_PER_IP))) return locked();
  } catch (e) {
    logFailure("[account] rate limit unavailable, allowing", e);
  }
  const addressKey = `rl:pw-mail:${await sha256(address)}`;
  // the address's lock, on the login's transaction (no sweep inside it: kv.ts)
  const gate: PasswordGate = (t) => {
    const kv = new PgKv(t, () => deps.now, { sweep: false });
    return { open: () => belowLimit(kv, addressKey, PASSWORD_FAILURES_PER_ADDRESS), failed: () => countFailure(kv, addressKey, PASSWORD_LOCK_SEC) };
  };
  const session = isEmail(address) && password ? await redeemClientPassword(deps.db, address, password, deps.now, gate) : null;
  if (session === "locked") return locked();
  if (!session) {
    try {
      if (ipKey !== null) await countFailure(deps.env.KV, ipKey, PASSWORD_LOCK_SEC);
    } catch (e) {
      logFailure("[account] rate limit unavailable", e);
    }
    return accountResponse({ ok: false, error: "password" }, 400);
  }
  return accountResponse({ ok: true, locale: session.locale }, 200, sessionCookies(session.sessionRaw));
}
```

  5. After `lessonRef` (still outside the data section, which starts at "/** 400 for a body …"), add:

```ts
/**
 * "Sinu MS LABi konto parool on muudetud." after the response (phase 2c), with Maria's address from Seaded when there is one: never in
 * development, never to a sample address. A failure is logged by `later` (route.ts), never the address.
 */
function mailPasswordChange(deps: AccountDeps, to: { email: string; locale: Locale }): void {
  if (deps.dev || isSampleAddress(to.email)) return;
  deps.later(async () => {
    const contact = await readSetting(deps.db, "contact");
    const maria = typeof (contact as { email?: unknown } | null)?.email === "string" ? ((contact as { email: string }).email.trim()) : "";
    await sendMail(deps.env, passwordChangedMail(to.email, to.locale, maria));
  });
}
```

  6. In the data section, after the `newsletter` handler, add:

```ts
/**
 * POST /parool `{ password }` (phase 2c): sets or changes the account's password (client-password.ts). 200 `{ ok: true, passwordSetAt }`;
 * 400 `{ error: "password" }` (no usable string), `"short"` / `"long"` (10 … 200 characters) or `"email"` (the address itself); 429
 * `{ error: "rate" }` after 5 in an hour. The session goes on; the change is mailed to her after the response.
 */
async function setPassword(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const input = parsePassword(await readObject(request));
  if (!input.ok) return badInput(session, input.error);
  if (!(await withinClientLimit(deps, session.clientId, "client-password", PASSWORD_CHANGES_PER_HOUR, 60 * 60))) {
    logNote("[account] password change rate limited");
    return clientResponse(session, { ok: false, error: "rate" }, 429);
  }
  const result = await setClientPassword(deps.db, session.clientId, input.data.password, deps.now);
  if (result.kind === "gone") return unauthorized("none");
  if (result.kind === "problem") return badInput(session, result.problem);
  mailPasswordChange(deps, result);
  return clientResponse(session, { ok: true, passwordSetAt: result.changedAt.toISOString() });
}

/** DELETE /parool (phase 2c): removes the password; the e-mail code works as always. 200 `{ ok: true }`; the change is mailed when there was one. */
async function removePassword(request: Request, deps: AccountDeps): Promise<Response> {
  const session = await requireClient(request, deps);
  if (session instanceof Response) return session;
  const removed = await removeClientPassword(deps.db, session.clientId);
  if (!removed) return unauthorized("none");
  if (removed.had) mailPasswordChange(deps, removed);
  return clientResponse(session, { ok: true });
}
```

  7. In `dataRoute`'s switch, after `case "POST /uudiskiri": …`, add:

```ts
    case "POST /parool": return setPassword(request, deps);
    case "DELETE /parool": return removePassword(request, deps);
```

  8. In `handleAccountApi`'s switch, after `case "POST /code": …`, add `case "POST /parool-login": return await passwordLogin(request, deps);`.
- [ ] **Step 5: `passwordSetAt` in the profile** (`src/server/client-data.ts`).
  - `ClientProfile` gains `/** When her password was last set or changed (ISO); null without one (phase 2c). */ passwordSetAt: string | null;`.
  - In `loadDashboard`'s client select, add `hasPassword: sql<boolean>\`${clients.passwordHash} is not null\`,` and `passwordChangedAt: clients.passwordChangedAt,`.
  - The returned `client` gains `passwordSetAt: client.hasPassword && client.passwordChangedAt ? iso(client.passwordChangedAt) : null`.
  - The hash itself is never selected.
- [ ] **Step 6: The new profile field in the tests' fixtures.** Add `passwordSetAt: null` to each `client` object:
  - the `client:` of the `Dashboard` fixtures in `tests/unit/account-dashboard-dom.test.ts`, `account-dashboard.test.ts`, `account-readonly.test.ts`, `account-types.test.ts` and `account-details-dom.test.ts` (there before `...over`);
  - the expected `dash.client` in `tests/db/client-data.test.ts`, both places;
  - the expected `client` in "the session's client: profile, cards, …" and the `.client` in "PATCH /andmed saves name, phone and language …", in `tests/db/account-api.test.ts`.
- [ ] **Step 7: Write the DB tests.** Create `tests/db/password-api.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { clients, clientSessions, settings } from "@/db/schema";
import { handleAccountApi, type AccountDeps } from "@/server/account-api";
import { CLIENT_SESSION_TTL_MS } from "@/server/client-auth";
import { PgKv } from "@/server/kv";
import { newToken, sha256 } from "@/server/token";
import { stubFetch } from "../fakes";
import { makeTestDb } from "./helpers";

// Phase 2c (spec 7): the optional password through the account API — POST /parool sets or changes it, DELETE /parool removes it (each
// change mailed to her, the session going on), GET / says passwordSetAt, and POST /parool-login signs in with it: one answer for every
// failure, a lock after 5 failures for an address or 20 from an IP in 15 minutes. The KV store is the real Postgres one, with a clock
// the tests move. Mails go to a stubbed Resend (example.com addresses: a sample one, @example.test, is never mailed).

const NOW = new Date("2026-10-08T10:00:00Z");
const SITE = "https://mslab.example";
let db: Db;
let clock = NOW;

beforeEach(async () => {
  db = await makeTestDb();
  clock = NOW;
  for (const method of ["info", "error"] as const) vi.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Dependencies at the current `clock`, with the real PgKv; `flush()` runs the work after the response. */
function deps() {
  const tasks: (() => Promise<unknown>)[] = [];
  const d: AccountDeps = {
    db,
    env: { KV: new PgKv(db, () => clock), MAIL_FROM: "MS LAB <info@send.example>", MARIA_EMAIL: "maria@example.test", SITE_URL: SITE, RESEND_API_KEY: "re_test" },
    now: clock,
    siteUrl: SITE,
    later: (task) => void tasks.push(task),
    dev: false,
  };
  return { d, flush: () => Promise.all(tasks.splice(0).map((task) => task())) };
}

/** A client with a live session (its cookie). */
async function signedIn(email = "kati@example.com") {
  const [client] = await db.insert(clients).values({ email }).returning();
  const raw = newToken();
  await db.insert(clientSessions).values({ idHash: await sha256(raw), clientId: client.id, createdAt: NOW, expiresAt: new Date(NOW.getTime() + CLIENT_SESSION_TTL_MS) });
  return { client, cookie: `__Host-mslab_client=${raw}` };
}

type Call = { method: string; cookie?: string; body?: unknown; ip?: string };
const call = async (d: AccountDeps, path: string, c: Call) =>
  (await handleAccountApi(
    new Request(`${SITE}/api/konto${path}`, {
      method: c.method,
      headers: { ...(c.cookie ? { cookie: c.cookie } : {}), "x-forwarded-for": c.ip ?? "203.0.113.9", "content-type": "application/json" },
      body: c.body === undefined ? undefined : JSON.stringify(c.body),
    }),
    d,
  ))!;
const resendCalls = (f: ReturnType<typeof stubFetch>) => f.calls.filter((c) => c.url.includes("resend")).map((c) => c.body as { to: string; subject: string; text: string });

test("POST /parool sets it: 200 with passwordSetAt, the dashboard says it, the change is mailed with Maria's address; the session goes on", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  await db.insert(settings).values({ key: "contact", value: { email: "info@mslab.ee" } });
  const { cookie } = await signedIn();
  const { d, flush } = deps();
  const res = await call(d, "/parool", { method: "POST", cookie, body: { password: "pikk-parool-2026" } });
  expect([res.status, await res.json()]).toEqual([200, { ok: true, passwordSetAt: NOW.toISOString() }]);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  await flush();
  const mails = resendCalls(f);
  expect(mails.map((m) => [m.to, m.subject])).toEqual([["kati@example.com", "MS LABi konto parool on muudetud"]]);
  expect(mails[0].text).toContain("Kui see polnud sina, kirjuta kohe Mariale: info@mslab.ee");
  const dash = await call(d, "", { method: "GET", cookie });
  expect([dash.status, (await dash.json()).client.passwordSetAt]).toEqual([200, NOW.toISOString()]);
});

test("POST /parool refuses a short, a long or the e-mail address and a body without a string (400, nothing stored or mailed); 5 an hour (429)", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie, client } = await signedIn();
  const { d, flush } = deps();
  const post = async (body: unknown) => {
    const r = await call(d, "/parool", { method: "POST", cookie, body });
    return [r.status, (await r.json()).error];
  };
  expect(await post({ password: "lühike" })).toEqual([400, "short"]);
  expect(await post({ password: "x".repeat(201) })).toEqual([400, "long"]);
  expect(await post({ password: "kati@example.com" })).toEqual([400, "email"]);
  expect(await post({ password: 12 })).toEqual([400, "password"]);
  expect((await db.select().from(clients).where(eq(clients.id, client.id)))[0].passwordHash).toBeNull();
  await flush();
  expect(resendCalls(f)).toEqual([]);
  // the three refusals after a usable body counted against the hour's 5
  expect(await post({ password: "pikk-parool-2026" })).toEqual([200, undefined]);
  expect(await post({ password: "teine-parool-2026" })).toEqual([200, undefined]);
  expect(await post({ password: "kolmas-parool-2026" })).toEqual([429, "rate"]);
});

test("DELETE /parool removes it: 200, passwordSetAt null again, the removal mailed; with none to remove nothing is mailed", async () => {
  const f = stubFetch(() => Response.json({ id: "email_1" }));
  const { cookie } = await signedIn();
  const { d, flush } = deps();
  expect((await call(d, "/parool", { method: "DELETE", cookie })).status).toBe(200);
  await flush();
  expect(resendCalls(f)).toEqual([]);
  await call(d, "/parool", { method: "POST", cookie, body: { password: "pikk-parool-2026" } });
  const del = await call(d, "/parool", { method: "DELETE", cookie });
  expect(await del.json()).toEqual({ ok: true });
  await flush();
  expect(resendCalls(f)).toHaveLength(2);
  expect((await (await call(d, "", { method: "GET", cookie })).json()).client.passwordSetAt).toBeNull();
});

test("POST /parool-login: the right e-mail and password start the session (cookies, the old one replaced); every failure is the same 400", async () => {
  const { cookie } = await signedIn();
  const { d } = deps();
  await call(d, "/parool", { method: "POST", cookie, body: { password: "pikk-parool-2026" } });
  await db.insert(clients).values({ email: "nopw@example.com" });
  const login = (body: unknown) => call(d, "/parool-login", { method: "POST", body });
  const ok = await login({ email: " KATI@example.com ", password: "pikk-parool-2026", locale: "ru" });
  expect([ok.status, await ok.json()]).toEqual([200, { ok: true, locale: "et" }]); // an existing account keeps its language
  expect(ok.headers.get("cache-control")).toBe("private, no-store");
  expect(ok.headers.getSetCookie().some((line) => line.startsWith("__Host-mslab_client="))).toBe(true);
  expect((await call(d, "", { method: "GET", cookie })).status).toBe(401); // one device: the old session was replaced
  for (const body of [
    { email: "kati@example.com", password: "vale-parool-2026" },
    { email: "keegi@example.com", password: "pikk-parool-2026" },
    { email: "nopw@example.com", password: "pikk-parool-2026" },
    { email: "kati@example.com" },
  ]) {
    const res = await login(body);
    expect([res.status, await res.json()], JSON.stringify(body)).toEqual([400, { ok: false, error: "password" }]);
  }
});

test("the lock per address: after 5 failures within 15 minutes even the right password is 429 locked, from any IP; 15 minutes after the last failure it works", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: "pikk-parool-2026" } });
  const at = (sec: number) => {
    clock = new Date(NOW.getTime() + sec * 1000);
    return deps().d;
  };
  const login = (sec: number, password: string, ip: string) => call(at(sec), "/parool-login", { method: "POST", body: { email: "kati@example.com", password }, ip });
  for (let i = 0; i < 5; i++) expect((await login(i, `vale-${i}-parool`, `198.51.100.${i}`)).status).toBe(400);
  const locked = await login(10, "pikk-parool-2026", "198.51.100.77");
  expect([locked.status, await locked.json()]).toEqual([429, { ok: false, error: "locked" }]);
  expect((await login(4 + 15 * 60 + 1, "pikk-parool-2026", "198.51.100.78")).status).toBe(200);
}, 20_000);

test("attempts sent in parallel cannot pass the lock together: the address's failures are counted one after another, under its lock", async () => {
  const { cookie } = await signedIn();
  await call(deps().d, "/parool", { method: "POST", cookie, body: { password: "pikk-parool-2026" } });
  const statuses = await Promise.all(
    Array.from({ length: 8 }, async (_, i) => (await call(deps().d, "/parool-login", { method: "POST", body: { email: "kati@example.com", password: `vale-${i}-parool` }, ip: `198.51.100.${i}` })).status),
  );
  expect(statuses.filter((s) => s === 400)).toHaveLength(5);
  expect(statuses.filter((s) => s === 429)).toHaveLength(3);
}, 20_000);

test("the lock per IP: 20 failures from one IP in 15 minutes, whatever the addresses (unknown ones too), lock that IP; another IP still signs in", async () => {
  const { cookie } = await signedIn();
  const { d } = deps();
  await call(d, "/parool", { method: "POST", cookie, body: { password: "pikk-parool-2026" } });
  for (let i = 0; i < 20; i++)
    expect((await call(d, "/parool-login", { method: "POST", body: { email: `keegi${i}@example.com`, password: "pikk-parool-2026" }, ip: "198.51.100.200" })).status).toBe(400);
  expect((await call(d, "/parool-login", { method: "POST", body: { email: "kati@example.com", password: "pikk-parool-2026" }, ip: "198.51.100.200" })).status).toBe(429);
  expect((await call(d, "/parool-login", { method: "POST", body: { email: "kati@example.com", password: "pikk-parool-2026" }, ip: "198.51.100.201" })).status).toBe(200);
}, 30_000);
```

- [ ] **Step 8: Run** `npx vitest run` (all), tsc, lint — green. The DB password tests run scrypt about 40 times: a few seconds.
- [ ] **Step 9: Commit.**

```bash
git add app/src/server/account-api.ts "app/src/app/api/konto/[[...path]]/route.ts" app/src/server/ratelimit.ts app/src/server/kv.ts app/src/server/client-data.ts app/src/server/account-mail.ts app/src/lib/json-request.ts app/src/i18n/dict/et.ts app/src/i18n/dict/ru.ts app/tests
git commit -m "feat(account): password endpoints — login with one answer and a lock, set and remove with a mail, passwordSetAt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Minu andmed → "Parool"

Spec section 7 (Minu andmed → "Parool").
- **Without a password:** "Saad soovi korral määrata parooli ja siseneda edaspidi e-posti ja parooliga. Kood töötab alati edasi." and "Määra parool". That opens the form: the password twice, 10 … 200 characters, not the e-mail address.
- **With one:** "Parool on määratud (muudetud {date})." with "Muuda parooli" and "Eemalda parool". "Eemalda parool" asks once inline, as "Kustuta konto" does.
- The session goes on after every change. The mail is the server's (Task 12).
- The section sits between the newsletter switch and "Kustuta konto". "Salvesta parool" is an outline button, so the profile's "Salvesta" stays the screen's one primary button.

**Files:**
- Create: `app/src/components/account/PasswordSection.tsx`
- Modify: `app/src/components/account/DetailsTab.tsx`, `DetailsTab.module.css`
- Modify: `app/src/i18n/dict/et.ts`, `ru.ts` (`account.details.password`)
- Test: `app/tests/unit/account-details-dom.test.ts`, `app/tests/e2e/account-details.spec.ts`

**Interfaces:**
- Consumes:
  - `ClientProfile.passwordSetAt` and `POST` / `DELETE /api/konto/parool` (Task 12);
  - `passwordProblem` (Task 11);
  - `sendJson` with `"DELETE"` (Task 12).
- Produces:
  - `PasswordSection({ email, setAt, locale, t, reload })`;
  - the DOM marks `[data-details-password]`, `[data-password-state]` (`none` / `set`), `[data-password-set]`, `[data-password-change]`, `[data-password-remove]`, `[data-password-form]`, `[data-password-save]`, `[data-password-cancel]`, `[data-password-error]`, `[data-password-confirm]`, `[data-password-remove-yes]`, `[data-password-remove-no]`, `[data-password-status]`.
- Produces, in the dictionaries: `account.details.password`.

- [ ] **Step 1: The dictionaries.** In `account.details`, before `loading`:
  - `et.ts`:

```ts
      // "Parool" (components/account/PasswordSection.tsx, phase 2c): optional, next to the e-mail code. {date} is the last change.
      password: {
        title: "Parool",
        none: "Saad soovi korral määrata parooli ja siseneda edaspidi e-posti ja parooliga. Kood töötab alati edasi.",
        isSet: "Parool on määratud (muudetud {date}).",
        set: "Määra parool",
        change: "Muuda parooli",
        remove: "Eemalda parool",
        newPassword: "Uus parool",
        repeat: "Korda parooli",
        save: "Salvesta parool",
        cancel: "Tühista",
        short: "Parool peab olema vähemalt 10 märki.",
        long: "Parool võib olla kuni 200 märki.",
        email: "Parool ei tohi olla sinu e-posti aadress.",
        mismatch: "Paroolid ei ühti.",
        saved: "Parool on salvestatud.",
        removed: "Parool on eemaldatud.",
        removeQuestion: "Kas eemaldame parooli? Saad edasi siseneda koodiga.",
        removeYes: "Jah, eemalda",
        failed: "Ei õnnestunud salvestada. Proovi uuesti.",
        rate: "Oled parooli juba mitu korda muutnud. Proovi tunni aja pärast uuesti.",
      },
```

  - `ru.ts`:

```ts
      password: {
        title: "Пароль",
        none: "При желании вы можете задать пароль и входить по e-mail и паролю. Код по-прежнему работает.",
        isSet: "Пароль задан (изменён {date}).",
        set: "Задать пароль",
        change: "Изменить пароль",
        remove: "Удалить пароль",
        newPassword: "Новый пароль",
        repeat: "Повторите пароль",
        save: "Сохранить пароль",
        cancel: "Отмена",
        short: "Пароль должен быть не короче 10 символов.",
        long: "Пароль может быть не длиннее 200 символов.",
        email: "Пароль не может совпадать с вашим e-mail.",
        mismatch: "Пароли не совпадают.",
        saved: "Пароль сохранён.",
        removed: "Пароль удалён.",
        removeQuestion: "Удалить пароль? Вы сможете входить с кодом.",
        removeYes: "Да, удалить",
        failed: "Не удалось сохранить. Попробуйте ещё раз.",
        rate: "Вы уже несколько раз меняли пароль. Попробуйте через час.",
      },
```

- [ ] **Step 2: Write the failing DOM tests.** Append to `tests/unit/account-details-dom.test.ts`:

```ts
describe("Parool (phase 2c)", () => {
  const savePassword = async () => {
    await act(async () => $<HTMLFormElement>("[data-password-form]")!.requestSubmit());
    await settle();
  };
  const passwordFields = () => [...document.querySelectorAll<HTMLInputElement>("[data-password-form] input[type=password]")];

  test("without a password: the sentence and 'Määra parool'; the form asks twice; too short, not the same, or the e-mail is said here and nothing is sent; Tühista closes it", async () => {
    api();
    await mount();
    expect($("[data-password-state]")?.textContent).toBe("Saad soovi korral määrata parooli ja siseneda edaspidi e-posti ja parooliga. Kood töötab alati edasi.");
    await click($("[data-password-set]"));
    const [first, second] = passwordFields();
    expect([first.getAttribute("autocomplete"), second.getAttribute("autocomplete")]).toEqual(["new-password", "new-password"]);
    expect(document.activeElement).toBe(first);
    await type(first, "lühike");
    await type(second, "lühike");
    await savePassword();
    expect($("[data-password-error]")?.textContent).toBe("Parool peab olema vähemalt 10 märki.");
    await type(first, "pikk-parool-2026");
    await type(second, "pikk-parool-2025");
    await savePassword();
    expect($("[data-password-error]")?.textContent).toBe("Paroolid ei ühti.");
    await type(first, "kati@example.test");
    await type(second, "kati@example.test");
    await savePassword();
    expect($("[data-password-error]")?.textContent).toBe("Parool ei tohi olla sinu e-posti aadress.");
    expect(sent("/api/konto/parool")).toEqual([]);
    await click($("[data-password-cancel]"));
    expect($("[data-password-form]")).toBeNull();
    expect(document.activeElement).toBe($("[data-password-set]"));
  });

  test("saved: 'Parool on määratud (muudetud {date}).' with 'Muuda parooli' and 'Eemalda parool', and 'Parool on salvestatud.'", async () => {
    api({}, { "/api/konto/parool": async () => json(200, { ok: true, passwordSetAt: "2026-10-08T10:00:00.000Z" }) });
    await mount();
    await click($("[data-password-set]"));
    const [first, second] = passwordFields();
    await type(first, "pikk-parool-2026");
    await type(second, "pikk-parool-2026");
    await savePassword();
    expect(sent("/api/konto/parool")).toEqual([{ password: "pikk-parool-2026" }]);
    expect($("[data-password-state]")?.textContent).toBe("Parool on määratud (muudetud 08.10.2026).");
    expect($("[data-password-status]")?.textContent).toBe("Parool on salvestatud.");
    expect($("[data-password-change]")?.textContent).toBe("Muuda parooli");
    expect($("[data-password-remove]")?.textContent).toBe("Eemalda parool");
  });

  test("the server's refusals: the e-mail rule, the hour's limit; a failure of ours", async () => {
    let answer = json(400, { ok: false, error: "email" });
    api({}, { "/api/konto/parool": async () => answer });
    await mount();
    await click($("[data-password-set]"));
    const [first, second] = passwordFields();
    await type(first, "pikk-parool-2026");
    await type(second, "pikk-parool-2026");
    await savePassword();
    expect($("[data-password-error]")?.textContent).toBe("Parool ei tohi olla sinu e-posti aadress.");
    answer = json(429, { ok: false, error: "rate" });
    await savePassword();
    expect($("[data-password-error]")?.textContent).toBe("Oled parooli juba mitu korda muutnud. Proovi tunni aja pärast uuesti.");
    answer = json(500, { ok: false, error: "server" });
    await savePassword();
    expect($("[data-password-error]")?.textContent).toBe("Ei õnnestunud salvestada. Proovi uuesti.");
  });

  test("with a password: 'Eemalda parool' asks once; 'Jah, eemalda' sends DELETE and the sentence without one comes back", async () => {
    api({ passwordSetAt: "2026-10-01T09:00:00.000Z" });
    await mount();
    expect($("[data-password-state]")?.textContent).toBe("Parool on määratud (muudetud 01.10.2026).");
    await click($("[data-password-remove]"));
    expect($("[data-password-confirm]")?.textContent).toContain("Kas eemaldame parooli? Saad edasi siseneda koodiga.");
    await click($("[data-password-remove-yes]"));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/konto/parool" && init?.method === "DELETE")).toBe(true);
    expect($("[data-password-state]")?.getAttribute("data-password-state")).toBe("none");
    expect($("[data-password-status]")?.textContent).toBe("Parool on eemaldatud.");
  });

  test("Russian", async () => {
    api({ locale: "ru", passwordSetAt: "2026-10-01T09:00:00.000Z" });
    await mount("ru");
    expect($("[data-password-state]")?.textContent).toBe("Пароль задан (изменён 01.10.2026).");
  });
});
```

     (`api`, `mount`, `click`, `type`, `sent`, `settle`, `json`, `fetchMock` and `$` are the file's.)
- [ ] **Step 3: Run it — expect FAIL.**
- [ ] **Step 4: Implement.**
  1. **Create `src/components/account/PasswordSection.tsx`:**

```tsx
"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import ui from "@/components/site/ui.module.css";
import { passwordProblem } from "@/domain/password";
import { fill, formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { isDone, sendJson } from "@/lib/json-request";
import type { Reload } from "./AccountLoader";
import type { DetailsTexts } from "./texts";
import fields from "./LoginForm.module.css";
import styles from "./DetailsTab.module.css";

type Mode = "view" | "edit" | "confirm";
type Status = { text: string; error: boolean } | null;

/**
 * Minu andmed → "Parool" (phase 2c, spec 7). Without a password: one sentence (the code always works) and "Määra parool". With one:
 * "Parool on määratud (muudetud {date})." with "Muuda parooli" and a quiet "Eemalda parool" that asks once (as "Kustuta konto"). The
 * form: the new password twice, checked here as the server checks it (10 … 200 characters, not the e-mail address, domain/password.ts)
 * and that the two are the same; "Salvesta parool" (an outline button: the profile's "Salvesta" stays the screen's one primary
 * button) and "Tühista". Each change is mailed to her by the server; the session goes on. A 401 reloads the page's data quietly.
 */
export function PasswordSection({ email, setAt: initial, locale, t, reload }: { email: string; setAt: string | null; locale: Locale; t: DetailsTexts["password"]; reload: Reload }) {
  const ids = { title: useId(), password: useId(), repeat: useId(), error: useId(), question: useId() };
  const [setAt, setSetAt] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const confirmStep = useRef<HTMLDivElement>(null);
  /** Where the focus goes after the next render: the form's first field, or back to the button that opened it. */
  const focusNext = useRef<"field" | "opener" | "confirm" | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target === "field") first.current?.focus();
    else if (target === "opener") opener.current?.focus();
    else if (target === "confirm") confirmStep.current?.focus();
  });

  const open = () => {
    setMode("edit");
    setPassword("");
    setRepeat("");
    setError(null);
    setStatus(null);
    focusNext.current = "field";
  };
  const close = () => {
    setMode("view");
    setError(null);
    focusNext.current = "opener";
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const problem = passwordProblem(password, email);
    const local = problem ? t[problem] : password !== repeat ? t.mismatch : null;
    if (local) {
      setError(local);
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    const answer = await sendJson("/api/konto/parool", { password });
    busy.current = false;
    setPending(false);
    if (isDone(answer) && typeof answer.data.passwordSetAt === "string") {
      setSetAt(answer.data.passwordSetAt);
      setPassword("");
      setRepeat("");
      setMode("view");
      setStatus({ text: t.saved, error: false });
      focusNext.current = "opener";
      return;
    }
    if (answer.status === 401) return void reload({ quiet: true });
    const code = answer.data.error;
    setError(code === "short" || code === "long" || code === "email" ? t[code] : code === "rate" ? t.rate : t.failed);
  };

  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const answer = await sendJson("/api/konto/parool", {}, { method: "DELETE" });
    busy.current = false;
    setPending(false);
    if (isDone(answer)) {
      setSetAt(null);
      setMode("view");
      setStatus({ text: t.removed, error: false });
      focusNext.current = "opener";
      return;
    }
    if (answer.status === 401) return void reload({ quiet: true });
    setStatus({ text: t.failed, error: true });
  };

  return (
    <section className={styles.password} aria-labelledby={ids.title} data-details-password="">
      <h2 id={ids.title} className={styles.sectionTitle}>
        {t.title}
      </h2>
      {mode === "edit" ? (
        <form onSubmit={save} noValidate data-password-form="">
          <div className={fields.field}>
            <label htmlFor={ids.password}>{t.newPassword}</label>
            <input
              ref={first}
              id={ids.password}
              type="password"
              autoComplete="new-password"
              maxLength={400}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={ids.error}
            />
          </div>
          <div className={fields.field}>
            <label htmlFor={ids.repeat}>{t.repeat}</label>
            <input
              id={ids.repeat}
              type="password"
              autoComplete="new-password"
              maxLength={400}
              value={repeat}
              onChange={(e) => {
                setRepeat(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={ids.error}
            />
          </div>
          <p id={ids.error} className={fields.error} role="alert" data-password-error="">
            {error ?? ""}
          </p>
          <div className={styles.answers}>
            <button type="submit" className={ui.btnOutline} aria-disabled={pending || undefined} data-password-save="">
              {t.save}
            </button>
            <button type="button" className={styles.quiet} onClick={close} data-password-cancel="">
              {t.cancel}
            </button>
          </div>
        </form>
      ) : setAt ? (
        <>
          <p className={styles.passwordLine} data-password-state="set">
            {fill(t.isSet, { date: formatDate(new Date(setAt), locale) })}
          </p>
          <div className={styles.answers}>
            <button ref={opener} type="button" className={ui.btnOutline} onClick={open} data-password-change="">
              {t.change}
            </button>
          </div>
          {mode === "confirm" ? (
            <div ref={confirmStep} className={`${styles.confirm} ${styles.passwordConfirm}`} role="group" aria-labelledby={ids.question} tabIndex={-1} data-password-confirm="">
              <p id={ids.question} className={styles.question}>
                {t.removeQuestion}
              </p>
              <div className={styles.answers}>
                <button type="button" className={`${ui.btn} ${styles.yes}`} onClick={() => void remove()} aria-disabled={pending || undefined} data-password-remove-yes="">
                  {t.removeYes}
                </button>
                <button type="button" className={ui.btnOutline} onClick={close} aria-disabled={pending || undefined} data-password-remove-no="">
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.deleteLink}
              onClick={() => {
                setMode("confirm");
                setStatus(null);
                focusNext.current = "confirm";
              }}
              data-password-remove=""
            >
              {t.remove}
            </button>
          )}
        </>
      ) : (
        <>
          <p className={styles.passwordLine} data-password-state="none">
            {t.none}
          </p>
          <button ref={opener} type="button" className={ui.btnOutline} onClick={open} data-password-set="">
            {t.set}
          </button>
        </>
      )}
      <p className={status?.error ? fields.error : fields.status} role="status" data-password-status="">
        {status?.text ?? ""}
      </p>
    </section>
  );
}
```

  2. **`DetailsTab.tsx`.**
     - Import `PasswordSection`.
     - Between the newsletter `<div className={styles.newsletter}>…</div>` and `<div className={styles.danger}>`, add `<PasswordSection email={client.email} setAt={client.passwordSetAt} locale={locale} t={t.password} reload={reload} />`.
     - The doc comment gains "…the newsletter switch, which saves at once; the optional password (phase 2c, PasswordSection); at the very bottom …".
  3. **`DetailsTab.module.css`.** After `.newsletter`, add:

```css
/* "Parool" (PasswordSection.tsx, phase 2c): a titled part under a line, the account's fields (LoginForm .field), one outline button */
.password {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}

.sectionTitle {
  margin: 0 0 10px;
  font: 400 24px/1.2 var(--font-display);
  letter-spacing: -0.01em;
}

.passwordLine {
  margin: 0 0 16px;
  font: 400 16px/1.5 var(--font-body);
}

/* "Tühista" beside "Salvesta parool": quiet text with a 44 px target */
.quiet {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 8px 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: 500 14px/1.2 var(--font-body);
  text-decoration: underline;
  cursor: pointer;
}

.passwordConfirm {
  margin-top: 16px;
}
```

     Update the file's top comment: "Three parts of its own: the newsletter switch, the password part (phase 2c), and, at the very bottom, …".
- [ ] **Step 5: Run** `npx vitest run tests/unit/account-details-dom.test.ts` and the whole `npx vitest run`, tsc, lint — green.
- [ ] **Step 6: E2E** (`tests/e2e/account-details.spec.ts`). Append:

```ts
test("Parool (phase 2c): set with the password twice, then 'Muuda parooli' and 'Eemalda parool' (asked once); the session goes on; no overflow", async ({ page }, info) => {
  submitsForms();
  const email = address("password", info.project.name);
  await insertClient(email);
  await signInAsClient(page, email);
  await page.goto("/konto/andmed");
  const part = page.locator("[data-details-password]");
  await expect(part.locator("[data-password-state]")).toHaveText("Saad soovi korral määrata parooli ja siseneda edaspidi e-posti ja parooliga. Kood töötab alati edasi.");
  await part.getByRole("button", { name: "Määra parool" }).click();
  await part.getByLabel("Uus parool").fill("pikk-parool-2026");
  await part.getByLabel("Korda parooli").fill("pikk-parool-2026");
  await part.getByRole("button", { name: "Salvesta parool" }).click();
  await expect(part.locator("[data-password-status]")).toHaveText("Parool on salvestatud.");
  await expect(part.locator("[data-password-state]")).toHaveText(/^Parool on määratud \(muudetud \d\d\.\d\d\.\d{4}\)\.$/);
  expect(await noOverflow(page)).toBe(true);
  expect(await smallTargets(part)).toEqual([]);
  await page.reload(); // still signed in, and the server says so
  await expect(part.locator("[data-password-state]")).toHaveAttribute("data-password-state", "set");
  await part.getByRole("button", { name: "Eemalda parool" }).click();
  await expect(part.locator("[data-password-confirm]")).toContainText("Kas eemaldame parooli? Saad edasi siseneda koodiga.");
  await part.getByRole("button", { name: "Jah, eemalda" }).click();
  await expect(part.locator("[data-password-status]")).toHaveText("Parool on eemaldatud.");
  await expect(part.locator("[data-password-state]")).toHaveAttribute("data-password-state", "none");
});
```

     (Import `smallTargets` from `./targets`; `address`, `noOverflow`, `insertClient`, `signInAsClient` are the file's or `./account`'s.)
- [ ] **Step 7: Run** `npx playwright test account-details` (dev), and `E2E_PROD_BUILD=1 npx playwright test account-details` — green. The `next build` output still lists `/[locale]/konto/andmed` as prerendered.
- [ ] **Step 8: Commit.**

```bash
git add app/src/components/account/PasswordSection.tsx app/src/components/account/DetailsTab.tsx app/src/components/account/DetailsTab.module.css app/src/i18n/dict/et.ts app/src/i18n/dict/ru.ts app/tests/unit/account-details-dom.test.ts app/tests/e2e/account-details.spec.ts
git commit -m "feat(account): Minu andmed — the optional password: set, change, remove

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The login page → "Sisene parooliga"

Spec section 7 (Login).
- The e-mail → code/link flow is unchanged.
- Below it, a quiet link "Sisene parooliga" switches to e-mail + password + "Logi sisse", with "Saada mulle hoopis kood" to go back.
- The page stays a static shell. The step lives in the fragment, `#parool`, so a reload keeps it.
- Answers: 400 → "E-post või parool ei sobi." (the password field emptied); 429 → "Liiga palju katseid. Proovi 15 minuti pärast uuesti või sisene koodiga."; anything else → the page's "Midagi läks valesti. Proovi uuesti.".
- Signed in, it opens "Minu konto" as the code does: `location.replace`, the e-mail remembered, the favourites copy forgotten.

**Files:**
- Modify: `app/src/components/account/LoginForm.tsx`, `app/src/components/account/login-address.ts`
- Modify: `app/src/i18n/dict/et.ts`, `ru.ts` (`account.login`)
- Test: `app/tests/unit/login-password-dom.test.ts` (new), `app/tests/e2e/account-login.spec.ts`, `app/tests/e2e/account.ts` (+ `clearPasswordLock`)

**Interfaces:**
- Consumes: `POST /api/konto/parool-login` (Task 12).
- Produces:
  - `PASSWORD_MARK = "parool"` (`login-address.ts`);
  - the login step `"password"` (`data-login-step="password"`), with `[data-login-password]`, `[data-login-to-password]`, `[data-login-to-code]` and `[data-login-password-error]`.
- Produces, in `tests/e2e/account.ts`: `clearPasswordLock(email: string): Promise<void>`.

- [ ] **Step 1: The dictionaries.** In `account.login`, after `changeEmail`:
  - `et.ts`:

```ts
      // the password (phase 2c): a quiet link under the e-mail step, its own step (#parool), and the way back to the code
      toPassword: "Sisene parooliga",
      password: "Parool",
      toCode: "Saada mulle hoopis kood",
      passwordWrong: "E-post või parool ei sobi.",
      passwordLocked: "Liiga palju katseid. Proovi 15 minuti pärast uuesti või sisene koodiga.",
```

  - `ru.ts`:

```ts
      toPassword: "Войти с паролем",
      password: "Пароль",
      toCode: "Лучше пришлите мне код",
      passwordWrong: "E-mail или пароль не подходят.",
      passwordLocked: "Слишком много попыток. Попробуйте через 15 минут или войдите с кодом.",
```

- [ ] **Step 2: Write the failing DOM test.** Create `tests/unit/login-password-dom.test.ts`:

```ts
// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LoginForm } from "@/components/account/LoginForm";
import { getDict, type Locale } from "@/i18n/locales";

// The login page's password step (phase 2c, spec 7): "Sisene parooliga" under the e-mail step, its own step kept in the fragment
// (#parool), "Saada mulle hoopis kood" back, and the answers of POST /api/konto/parool-login.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const replace = vi.fn<(url: string | URL) => void>();
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  });
const click = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => (el as HTMLElement).click());
  await settle();
};
const type = async (input: HTMLInputElement | null, value: string) => {
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const mount = async (locale: Locale = "et") => {
  const d = getDict(locale);
  await act(async () => root.render(createElement(LoginForm, { locale, t: { ...d.account.login, title: d.nav.login, badEmail: d.forms.errorEmail } })));
  await settle();
};
const signIn = async () => {
  await act(async () => $<HTMLFormElement>("[data-login-password]")!.requestSubmit());
  await settle();
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  replace.mockReset();
  vi.spyOn(window.location, "replace").mockImplementation(replace);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/konto/sisene");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("'Sisene parooliga' opens the e-mail and password step and keeps it in the address (#parool); 'Saada mulle hoopis kood' goes back", async () => {
  await mount();
  await click($("[data-login-to-password]"));
  expect($("section")?.getAttribute("data-login-step")).toBe("password");
  expect(window.location.hash).toBe("#parool");
  const pw = $<HTMLInputElement>("[data-login-password] input[type=password]")!;
  expect([pw.name, pw.getAttribute("autocomplete")]).toEqual(["password", "current-password"]);
  expect($<HTMLInputElement>("[data-login-password] input[type=email]")?.getAttribute("autocomplete")).toBe("username");
  await click($("[data-login-to-code]"));
  expect($("section")?.getAttribute("data-login-step")).toBe("email");
  expect(window.location.hash).toBe("");
});

test("#parool in the address opens the password step at once (a reload keeps it)", async () => {
  window.history.replaceState(null, "", "/konto/sisene#parool");
  await mount();
  expect($("section")?.getAttribute("data-login-step")).toBe("password");
});

test("the right e-mail and password: POST parool-login with the page's language, then 'Minu konto' in place of this page", async () => {
  fetchMock.mockResolvedValue(json(200, { ok: true, locale: "et" }));
  window.history.replaceState(null, "", "/konto/sisene#parool");
  await mount();
  await type($<HTMLInputElement>("[data-login-password] input[type=email]"), " Kati@Example.test ");
  await type($<HTMLInputElement>("[data-login-password] input[type=password]"), "pikk-parool-2026");
  await signIn();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/konto/parool-login");
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ email: "kati@example.test", password: "pikk-parool-2026", locale: "et" });
  expect(replace).toHaveBeenCalledWith("/konto");
});

test("wrong: 'E-post või parool ei sobi.' and the password emptied; locked: the 15 minutes sentence; our failure: try again", async () => {
  window.history.replaceState(null, "", "/konto/sisene#parool");
  await mount();
  const pw = () => $<HTMLInputElement>("[data-login-password] input[type=password]")!;
  await type($<HTMLInputElement>("[data-login-password] input[type=email]"), "kati@example.test");
  fetchMock.mockResolvedValueOnce(json(400, { ok: false, error: "password" }));
  await type(pw(), "vale-parool-2026");
  await signIn();
  expect($("[data-login-password-error]")?.textContent).toBe("E-post või parool ei sobi.");
  expect(pw().value).toBe("");
  expect(document.activeElement).toBe(pw());
  fetchMock.mockResolvedValueOnce(json(429, { ok: false, error: "locked" }));
  await type(pw(), "vale-parool-2026");
  await signIn();
  expect($("[data-login-password-error]")?.textContent).toBe("Liiga palju katseid. Proovi 15 minuti pärast uuesti või sisene koodiga.");
  fetchMock.mockResolvedValueOnce(json(500, { ok: false, error: "server" }));
  await signIn();
  expect($("[data-login-password-error]")?.textContent).toBe("Midagi läks valesti. Proovi uuesti.");
  expect(replace).not.toHaveBeenCalled();
});

test("Russian", async () => {
  await mount("ru");
  expect($("[data-login-to-password]")?.textContent).toBe("Войти с паролем");
});
```

- [ ] **Step 3: Run it — expect FAIL.**
- [ ] **Step 4: Implement.**
  1. **`login-address.ts`.** After `SIGNED_OUT_MARK`, add:

```ts
/** The login page's password step (phase 2c): the fragment `#parool`, so that a reload opens it again. Not a parameter: it is left in the address. */
export const PASSWORD_MARK = "parool";
```

  2. **`LoginForm.tsx`.**
     - Import `PASSWORD_MARK` with `forwardsSignedIn` and `readLoginAddress` from `./login-address`.
     - The types: `type FocusTarget = "email" | "code" | "resend" | "typo" | "password";` and `type PasswordError = "email" | "wrong" | "locked" | "server";`.
     - State: `useState<"email" | "code" | "password">("email")` for `step`, and add:

```ts
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<PasswordError | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
```

     - In the focus effect's map, add `password: passwordRef`.
     - After `changeEmail`, add:

```ts
  /** The address with or without the password step's fragment (history.replaceState: no new entry, the page is not loaded again). */
  const markPasswordStep = (on: boolean) =>
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${on ? `#${PASSWORD_MARK}` : ""}`);

  /** "Sisene parooliga": the e-mail and password step (#parool, kept for a reload). */
  const toPassword = () => {
    setStep("password");
    setPassword("");
    setPasswordError(null);
    setSendError(null);
    setTypo(null);
    setBanner(null);
    markPasswordStep(true);
    focusAfterRender.current = email ? "password" : "email";
  };

  /** "Saada mulle hoopis kood": back to the e-mail step (the code), the address without #parool. */
  const toCode = () => {
    setStep("email");
    setPassword("");
    setPasswordError(null);
    markPasswordStep(false);
    focusAfterRender.current = "email";
  };

  /** The e-mail and password: signs in and opens "Minu konto", or says what to do (every wrong answer is the same sentence). */
  async function signInWithPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy.current) return;
    const address = normalizeEmail(email);
    setEmail(address);
    if (!isEmail(address)) {
      setPasswordError("email");
      focusAfterRender.current = "email";
      return;
    }
    if (!password) {
      setPasswordError("wrong");
      focusAfterRender.current = "password";
      return;
    }
    busy.current = true;
    setChecking(true);
    setPasswordError(null);
    const { status, data } = await sendJson("/api/konto/parool-login", { email: address, password, locale });
    if (status === 200 && data.ok === true) {
      rememberEmail(address);
      forgetAccountFavourites(); // a previous session's copy of the favourites must not show for this account
      window.location.replace(locale === "ru" ? "/ru/konto" : "/konto");
      return;
    }
    busy.current = false;
    setChecking(false);
    setPasswordError(status === 400 ? "wrong" : status === 429 ? "locked" : "server");
    if (status === 400) setPassword("");
    focusAfterRender.current = "password";
  }
```

     - In `arrive`, after the `if (problem) { … }` block, add:

```ts
    if (window.location.hash === `#${PASSWORD_MARK}`) {
      setStep("password"); // "Sisene parooliga" kept for a reload (#parool); the e-mail is the remembered one
      return;
    }
```

     - Before the `return (`, add:

```ts
  const passwordMessage = passwordError ? { email: t.badEmail, wrong: t.passwordWrong, locked: t.passwordLocked, server: t.server }[passwordError] : "";
```

     - In the markup, the e-mail step's branch becomes a fragment: the e-mail form as it is, then

```tsx
            <div className={styles.actions}>
              <button type="button" className={styles.textButton} onClick={toPassword} data-login-to-password="">
                {t.toPassword}
              </button>
            </div>
```

     - Between the e-mail step and the code step, add the password step (`step === "email" ? (…) : step === "password" ? (…) : (code step)`):

```tsx
        ) : step === "password" ? (
          <>
            <form method="post" noValidate onSubmit={(e) => void signInWithPassword(e)} data-login-password="">
              <div className={styles.field}>
                <label htmlFor={`${id}-pw-email`}>{t.email}</label>
                <input
                  ref={emailRef}
                  id={`${id}-pw-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setPasswordError(null);
                  }}
                  aria-invalid={passwordError === "email" ? true : undefined}
                  aria-describedby={`${id}-pw-message`}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor={`${id}-password`}>{t.password}</label>
                <input
                  ref={passwordRef}
                  id={`${id}-password`}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={400}
                  value={password}
                  readOnly={checking}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  aria-invalid={passwordError === "wrong" ? true : undefined}
                  aria-describedby={`${id}-pw-message`}
                />
                <p id={`${id}-pw-message`} className={styles.error} aria-live="polite" data-login-password-error="">
                  {passwordMessage}
                </p>
              </div>
              <button type="submit" className={`${ui.btn} ${ui.btnFull}`} aria-disabled={checking || undefined}>
                {t.submit}
                <Icon name="arrow" />
              </button>
            </form>
            <div className={styles.actions}>
              <button type="button" className={styles.textButton} onClick={toCode} data-login-to-code="">
                {t.toCode}
              </button>
            </div>
          </>
```

     - In the component's doc comment, after the first sentence, add: "Below the e-mail step a quiet 'Sisene parooliga' opens the e-mail and password step (phase 2c; the fragment `#parool` keeps it for a reload), with 'Logi sisse' and 'Saada mulle hoopis kood' back: POST /api/konto/parool-login, one sentence for every wrong answer, another for the lock." Change "No password and no other step." to "The code is the default; the password is optional (Minu andmed)."
- [ ] **Step 5: Run** `npx vitest run tests/unit/login-password-dom.test.ts tests/unit/account-client.test.ts tests/unit/login-address.test.ts`, then the whole `npx vitest run`, tsc, lint — green.
- [ ] **Step 6: E2E.**
  1. **`tests/e2e/account.ts`.** Append:

```ts
/** The password lock's counter of an address (phase 2c: rl:pw-mail:<sha256 of the address>, 15 minutes) cleared, so a test starts without one. */
export async function clearPasswordLock(email: string): Promise<void> {
  await localDb((sql) => sql`delete from kv_entries where key = ${`rl:pw-mail:${sha256Hex(email.trim().toLowerCase())}`}`);
}
```

  2. **`tests/e2e/account-login.spec.ts`.** Import `clearPasswordLock` and `insertClient` from `./account`, and append:

```ts
test("a password (phase 2c): set in Minu andmed; after logging out 'Sisene parooliga' signs in with it; a wrong one says so; 5 wrong ones lock it", async ({ page }, info) => {
  submitsForms();
  const email = clientEmail("password", info.project.name);
  await removeClientRows(email);
  await clearPasswordLock(email);
  await insertClient(email);
  try {
    await signInAsClient(page, email);
    await page.goto("/konto/andmed");
    await page.getByRole("button", { name: "Määra parool" }).click();
    await page.getByLabel("Uus parool").fill("pikk-parool-2026");
    await page.getByLabel("Korda parooli").fill("pikk-parool-2026");
    await page.getByRole("button", { name: "Salvesta parool" }).click();
    await expect(page.locator("[data-password-status]")).toHaveText("Parool on salvestatud.");
    await page.evaluate(() => fetch("/api/konto/logout", { method: "POST" }));

    await openLogin(page);
    await page.getByRole("button", { name: "Sisene parooliga" }).click();
    await expect(page).toHaveURL(/\/konto\/sisene#parool$/);
    await emailField(page).fill(email);
    await page.getByLabel("Parool", { exact: true }).fill("vale-parool-2026");
    await page.getByRole("button", { name: "Logi sisse", exact: true }).click();
    await expect(page.locator("[data-login-password-error]")).toHaveText("E-post või parool ei sobi.");
    await page.reload(); // the step stays (#parool)
    await expect(page.locator("[data-login-step]")).toHaveAttribute("data-login-step", "password");
    await emailField(page).fill(email);
    await page.getByLabel("Parool", { exact: true }).fill("pikk-parool-2026");
    await page.getByRole("button", { name: "Logi sisse", exact: true }).click();
    await expect(page).toHaveURL(/\/konto$/);
    await expect(page.locator(DASHBOARD)).toBeVisible();

    // the lock: 5 wrong ones (one above) and then even the right one is refused for 15 minutes
    await page.evaluate(() => fetch("/api/konto/logout", { method: "POST" }));
    await openLogin(page, `${LOGIN}#parool`);
    await emailField(page).fill(email);
    for (let i = 0; i < 4; i++) {
      await page.getByLabel("Parool", { exact: true }).fill(`vale-${i}-parool-2026`);
      await page.getByRole("button", { name: "Logi sisse", exact: true }).click();
      await expect(page.locator("[data-login-password-error]")).toHaveText("E-post või parool ei sobi.");
    }
    await page.getByLabel("Parool", { exact: true }).fill("pikk-parool-2026");
    await page.getByRole("button", { name: "Logi sisse", exact: true }).click();
    await expect(page.locator("[data-login-password-error]")).toHaveText("Liiga palju katseid. Proovi 15 minuti pärast uuesti või sisene koodiga.");
    await page.getByRole("button", { name: "Saada mulle hoopis kood" }).click();
    await expect(page.locator("[data-login-step]")).toHaveAttribute("data-login-step", "email");
    expect(new URL(page.url()).hash).toBe("");
  } finally {
    await clearPasswordLock(email);
    await removeClientRows(email);
  }
});
```

     ("Parool" with `exact: true` is the login page's field. The e-mail field is `emailField`, the label "E-post", exact.)
- [ ] **Step 7: Run** `npx playwright test account-login account-details` (dev) and `E2E_PROD_BUILD=1 npx playwright test account-login` — green. `next build` still lists `/[locale]/konto/sisene` as prerendered.
- [ ] **Step 8: Commit.**

```bash
git add app/src/components/account/LoginForm.tsx app/src/components/account/login-address.ts app/src/i18n/dict/et.ts app/src/i18n/dict/ru.ts app/tests/unit/login-password-dom.test.ts app/tests/e2e/account.ts app/tests/e2e/account-login.spec.ts
git commit -m "feat(account): 'Sisene parooliga' on the login page — e-mail and password, one answer, the lock's sentence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: The docs for the new account layout

On 08.10.2026 the site moved to Maria's accounts and to https://mslab.ee. `docs/deploy.md` and `docs/launch-checklist.md` still describe Dim's accounts and mslab.diipsolutions.eu.

Only accounts, names and domains change: every procedure, check and explanation stays as it is. No secret goes in (no key, token, webhook secret or database URL).

The new sending address goes in whole here, so the address guard's allow-list gets it in the same commit. The files the docs point at for these names follow too: `.env.example`, the dev fallbacks in `env.ts`, and the default of `tools/cache-smoke.mjs`.

**Files:**
- Modify: `docs/deploy.md`, `docs/launch-checklist.md`
- Modify: `app/tests/unit/test-addresses.test.ts` (the allow-list), `app/.env.example`, `app/src/server/env.ts`, `app/tests/unit/env.test.ts`, `tools/cache-smoke.mjs`

**Interfaces:** none (documentation, defaults and one allow-list entry).

In this task "the sending address" means the local part `info`, then `@send.mslab.ee`, written as one address with no space. This plan never writes it whole: the guard scans `docs/`.

- [ ] **Step 1: The allow-list first** (`app/tests/unit/test-addresses.test.ts`).
  - In `PUBLIC`, add the sending address, with the reason `"the site's sending address on Maria's Resend since 08.10.2026 (MAIL_FROM)"`.
  - The existing `send.diipsolutions.eu` entry's reason becomes `"the site's sending address until 08.10.2026 (MAIL_FROM; older docs and plans name it)"`.
  - Run `npx vitest run tests/unit/test-addresses.test.ts` — PASS.
- [ ] **Step 2: `docs/deploy.md`.**
  1. **The opening paragraph.** Replace the first sentence ("Since 03.10.2026 https://mslab.diipsolutions.eu runs on **Vercel**.") with: "Since 08.10.2026 the site is **https://mslab.ee**, on **Vercel**, on Maria's accounts (from 03.10 to 08.10.2026 it was https://mslab.diipsolutions.eu on Dim's, which now only redirects to mslab.ee)." In the next sentence, "are retired" becomes "are retired and deleted". The rest of the paragraph stays.
  2. **Section 1, the table.**
     - App: "Vercel project `mslab` on Dim's Hobby account (Maria's account later)." → "Vercel project `mslab` in Maria's team `ms-lab` (Hobby plan)." The rest of the cell stays.
     - A new row after App: `| Code | GitHub \`mslabinformation-collab/mslab\` (Maria's; Dim has push). A push to \`main\` deploys production (section 3). |`
     - Domain: "`mslab.diipsolutions.eu`, added to the Vercel project. DNS stays in the Cloudflare zone `diipsolutions.eu` (section 4)." → "`mslab.ee` and `www.mslab.ee`, added to the Vercel project. DNS at the domain's registrar, veebimajutus.ee (Elkdata) (section 4)."
     - Database: "Railway Postgres, reached directly …" → "Railway Postgres in Maria's project `mslab` (Postgres 18, EU West), reached directly …".
     - Uploaded images: "Cloudflare R2 bucket `mslab-media`," → "Cloudflare R2 bucket `mslab-media` on Maria's Cloudflare account,".
     - Lesson videos: "A Bunny Stream library (section 10):" → "The Bunny Stream library `mslab` (id 773592) on Maria's Bunny account (section 10):".
     - E-mail, Telegram: "Resend (sender domain `send.diipsolutions.eu`)" → "Resend on Maria's account (sender domain `send.mslab.ee`)".
     - Under the table, "… until the launch on mslab.ee." → "… until the public launch (`docs/launch-checklist.md` section 1)."
  3. **Section 2.**
     - `SITE_URL`: "Today `https://mslab.diipsolutions.eu`." → "Today `https://mslab.ee`."
     - `MARIA_EMAIL`: "(Dim's address until the mslab.ee launch, then Maria's)" → "(Dim's address until the public launch, then Maria's)".
     - `MAIL_FROM`: after "`MS LAB <address on the Resend domain>`." add " Today the address is the sending address on `send.mslab.ee`:" followed by the sending address written whole in backticks.
  4. **Section 3.**
     - "The project's Git integration deploys `main` to production on every push" → "The project's Git integration (`mslabinformation-collab/mslab`) deploys `main` to production on every push".
     - In step 1 of "After the first Git deploy of `main`", the curl address's host `https://mslab.diipsolutions.eu` → `https://mslab.ee`.
     - After the sentence "`.vercel/project.json` links the folder to the project (it is git-ignored; `vercel link` makes it).", add: "The CLI must be signed in to Maria's team `ms-lab`: Dim keeps that login in a global config folder of its own (`vercel --global-config ~/.vercel-mslabinformation …`)."
  5. **Section 4, DNS.** Replace the section's two paragraphs with:

```
The domain `mslab.ee` is registered, and its DNS hosted, at veebimajutus.ee (Elkdata). The apex `A` record points at Vercel (`76.76.21.21`) and `www` as Vercel's Domains page shows it; Resend's records (DKIM, SPF, return path) sit under `send.`; the mail records (MX and the rest) stay as they were. Vercel issues and renews the certificate itself. Keep any proxy out of the way: a proxy in front would hand every visitor the same address in `x-forwarded-for`, and the form rate limits would share one bucket.

The old name `mslab.diipsolutions.eu` (a `CNAME` in Dim's Cloudflare zone `diipsolutions.eu`) still points at Dim's old Vercel project, which only redirects to mslab.ee. Remove both after a few weeks (`docs/launch-checklist.md` section 1).
```

  6. **Section 6.** "Take the **public** TCP proxy URL from the Railway Postgres service" → "Take the **public** TCP proxy URL from the Postgres service of Maria's Railway project `mslab`".
  7. **Section 8, item 2.** Replace "**Back to Cloudflare.** …" (the whole item) with: "**Back to Cloudflare: no longer possible.** The Worker `mslab-web`, its Hyperdrive config, the D1 tag cache and Dim's R2 bucket were deleted on 08.10.2026, when the accounts moved; the only rollback is a Vercel deployment (1)."
  8. **Section 10.**
     - Step 1: insert at its start "Done on 08.10.2026 on Maria's Bunny account: the library `mslab`, id 773592 (the value of `BUNNY_LIBRARY_ID`). For a new library:".
     - Allowed domains: "`mslab.diipsolutions.eu` now; at the mslab.ee launch add `mslab.ee` and `www.mslab.ee` (`docs/launch-checklist.md` section 8)." → "`mslab.ee` and `www.mslab.ee` (and the project's own `*.vercel.app` address while testing).".
     - Webhook: the URL's host `https://mslab.diipsolutions.eu` → `https://mslab.ee`, and delete the sentence "At the mslab.ee launch the host in this URL changes (`docs/launch-checklist.md` section 8)."
     - "**Moving to Maria's Bunny account later.** …" → "**Maria's Bunny account.** The library has been Maria's from the start (08.10.2026): nothing to move."
     - First-use check 3: `-H 'Referer: https://mslab.diipsolutions.eu/'` → `-H 'Referer: https://mslab.ee/'`.
  9. **Check.** Run `grep -n "diipsolutions" docs/deploy.md`. It lists only the opening paragraph and section 4, where the old name is named as the old one.
- [ ] **Step 3: `docs/launch-checklist.md`.**
  1. **The opening paragraph.** Replace "Phase 1 is live as a **prototype** on https://mslab.diipsolutions.eu (Vercel Hobby, project `mslab`; how it is set up and deployed: `docs/deploy.md`) for Dim and Maria only. This list collects everything that must happen before real visitors arrive (target domain mslab.ee, accounts under Maria's e-mail)." with "The site is live on **https://mslab.ee** since 08.10.2026, on Maria's accounts (Vercel team `ms-lab`, project `mslab`, Hobby; how it is set up and deployed: `docs/deploy.md`), still as a **prototype** for Dim and Maria only. This list collects everything that must happen before real visitors arrive." The "Sources: …" sentence stays.
  2. **Section 1.**
     - "Recreate Vercel … under Maria's accounts; move the data …" → `- [x] Done 08.10.2026: Vercel (team \`ms-lab\`, project \`mslab\`, its Git integration with \`mslabinformation-collab/mslab\`, the domains and the variables), Cloudflare (the R2 bucket \`mslab-media\`), Railway (project \`mslab\`), Resend (\`send.mslab.ee\`) and Bunny (library 773592) are Maria's; the data was copied (a Postgres dump; the old bucket was empty). The review comments live in Postgres (\`kv_entries\`).`
     - "`SITE_URL` → https://mslab.ee …" → `- [x] Done 08.10.2026: \`SITE_URL\` is https://mslab.ee, and \`mslab.ee\` and \`www.mslab.ee\` are on the Vercel project (\`docs/deploy.md\` section 4).`
     - "**Delete the unused Cloudflare resources** …" → `- [ ] Cloudflare clean-up: done 08.10.2026 for the Workers \`mslab-web\` and \`mslab-guide\`, the Hyperdrive config, the D1 database \`mslab-next-tags\`, Dim's R2 bucket \`mslab-media\` and the KV namespace (checked against \`kv_entries\` first). Left: delete the R2 bucket \`mslab-next-cache\` once its one-day expiry has emptied it.`
     - Add after it: `- [ ] After a few weeks: remove Dim's old Vercel project (the mslab.diipsolutions.eu redirect) and the \`mslab\` CNAME in the Cloudflare zone \`diipsolutions.eu\`.`
  3. **Section 1b.**
     - "Point mslab.ee (and www) at Vercel …" → `- [x] Done 08.10.2026: mslab.ee and www point at Vercel; the DNS stays at veebimajutus (Elkdata), the old WordPress site is gone and the mail records were kept.`
     - "Site e-mail on `send.mslab.ee` in Resend …" → `- [x] Done 08.10.2026: the site's e-mail is on \`send.mslab.ee\` in Maria's Resend (DKIM/SPF/return-path records). Do not use Resend as Maria's personal SMTP (shared 100/day free quota).`
  4. **Section 8.**
     - "Dim creates the Bunny Stream library and sets …" → `- [ ] The library is Maria's (\`mslab\`, id 773592, 08.10.2026). Check that \`BUNNY_LIBRARY_ID\`, \`BUNNY_API_KEY\`, \`BUNNY_TOKEN_KEY\` and \`BUNNY_WEBHOOK_SECRET\` are set in Production of Maria's Vercel project (\`vercel env ls production\` lists the names); without them the admin says "Video seadistamata" and students "Video lisandub peagi".`
     - "mslab.ee launch: add `mslab.ee` and `www.mslab.ee` to the Bunny library's allowed domains …" → `- [x] Done 08.10.2026: the library's allowed domains are \`mslab.ee\` and \`www.mslab.ee\`, and the webhook URL's host is mslab.ee (\`docs/deploy.md\` section 10).`
     - "Maria's own Bunny account later: …" → `- [x] Done: the library is on Maria's Bunny account from the start (08.10.2026).`
- [ ] **Step 4: The same names where the docs point.**
  - **`app/.env.example`:** `SITE_URL=https://mslab.ee`, and the `MAIL_FROM` line's address becomes the sending address.
  - **`app/src/server/env.ts`:** in `REQUIRED`, `["SITE_URL", "https://mslab.ee"]`, and the `MAIL_FROM` fallback `MS LAB <` + the sending address + `>`. They are the dev and test fallbacks, never production's.
  - **`app/tests/unit/env.test.ts`:** the two expectations of the public fallbacks follow: `"https://mslab.ee"` and the new `MAIL_FROM`.
  - **`tools/cache-smoke.mjs`:** the default base in the usage comment and in `const base = …` becomes `https://mslab.ee`.
  - `src/server/site.ts` keeps `https://mslab.diipsolutions.eu` in `FIXED_LINK_ORIGINS`: links in mails sent before the move still point there, and the redirect serves them.
- [ ] **Step 5: Run** `npx vitest run` (the address guard and `env.test.ts` included), tsc, lint — green. Read both docs once more: no key, token, secret, database URL or personal address.
- [ ] **Step 6: Commit.**

```bash
git add docs/deploy.md docs/launch-checklist.md app/tests/unit/test-addresses.test.ts app/.env.example app/src/server/env.ts app/tests/unit/env.test.ts tools/cache-smoke.mjs
git commit -m "docs: the site on Maria's accounts at mslab.ee — deploy and launch checklist, the sending address

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Migration 0005 on Railway, the deploy and the live checks (controller)

Spec sections 3, 8 and 10. This task is run by the controller, not a subagent. It is the first that writes to Railway, pushes or deploys.

The order is "the additive migration first, then the deploy": the live code (3a) reads the campaign's row 1, selects only the columns it knows and writes no new one, so 0005 cannot disturb it.

The ledger is `.superpowers/sdd/2026-10-08-phase2c-feedback/progress.md` (git-ignored). Record each step's outcome there: counts only, never a URL, key or address.

**Files:** none (the database, the deployment and the ledger).

- [ ] **Step 1 (read-only): Railway before.** Take the public TCP proxy URL of Maria's Railway project `mslab` (Postgres → Connect → Public Network) and put it in the shell only (`docs/deploy.md` section 6), with `?sslmode=require`. Read, printing counts and flags only:
  - `select count(*) from drizzle.__drizzle_migrations` → 5 (0000–0004);
  - `select count(*) from information_schema.columns where table_name = 'campaign' and column_name = 'kind'` → 0;
  - `select id, active from campaign order by id` → one row, id 1. Note its `active`: Maria's choice, to restore after step 9.
- [ ] **Step 2: Branch checks.**
  - The whole `npx vitest run`, `npx tsc --noEmit --incremental false` and `npm run lint`.
  - `next build`: every `/[locale]/konto…` route is prerendered (● / ○), never ƒ.
  - The e2e under `next dev` and with `E2E_PROD_BUILD=1`.
  - `npm run visual`: look at `avaleht`, `koolitused`, `koolituskalender`, `praktika`, `koolitaja` and `uudised` at 390 / 834 / 1440 / 2560, ET and RU.
  - `git status` is clean on `feat/phase2c-feedback`.
- [ ] **Step 3 (read-only): the production variables.** Run `vercel --global-config ~/.vercel-mslabinformation env ls production` from the scratch link folder of Maria's project. Check that the names are there:
  - `DATABASE_URL`, `SITE_URL`, `MAIL_FROM`, `RESEND_API_KEY`, `CRON_SECRET`;
  - `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY`, `BUNNY_WEBHOOK_SECRET`.
  No value is printed. A missing Bunny name is Dim's to set (`docs/deploy.md` section 10) before step 8a.
- [ ] **Step 4: Migration 0005 on Railway.** Migrate first, then deploy.
  1. From `app/`: `DATABASE_URL='…?sslmode=require' npm run db:migrate`.
  2. Check:
     - `select count(*) from drizzle.__drizzle_migrations` → 6;
     - `select id, kind, active from campaign order by id` → (1, campaign, as in step 1) and (2, newsletter, false);
     - `select count(*) from clients where password_hash is not null` → 0;
     - `select count(*) from lesson_progress where clock_at is not null` → 0.
  3. Open https://mslab.ee once: the live (3a) site still answers, its campaign popup as before.
- [ ] **Step 5: Deploy.** Merge `feat/phase2c-feedback` into `main` and push `main` to `origin` (`mslabinformation-collab/mslab`): that push is the production deployment. Do not push the feature branch itself.
- [ ] **Step 6: READY.** `vercel --global-config ~/.vercel-mslabinformation ls mslab` (and `inspect <url>`): the deployment is READY and holds the production alias `mslab.ee`.
- [ ] **Step 7: Read-only acceptance on https://mslab.ee.**
  - `node tools/cache-smoke.mjs https://mslab.ee` passes parts A, B and C.
  - The remote read-only e2e is green with 1–2 workers: `E2E_BASE_URL=https://mslab.ee E2E_ALLOW_REMOTE=1 npx playwright test --workers=2`, as in phase 3a (the specs that submit or need the local database skip themselves). If a spec fails only because Maria's live content differs from the seed (her campaign text, a course she edited), note it in the ledger; do not change her content. Then `BASE_URL=https://mslab.ee npm run visual`.
  - `curl -s -X POST https://mslab.ee/api/konto/parool-login -H 'content-type: application/json' -d '{}'` → `{"ok":false,"error":"password"}` (400).
- [ ] **Step 8: Live checks.**
  1. **Bunny: `setCurrentTime` and the top speed** (the spec's live check).
     - Sign a sample client in as in phase 2a Task 11 step 7: a token row in Railway for a `*.naidis@example.test` address, then `/api/konto/verify?t=…`.
     - In the admin, give her access to the sample e-course `kulmumeistri-e-koolitus`. Add a module "Test 2c" with one lesson that has one real short video, under a minute, as in the 3a plan Task 12 step 9.
     - As the client, open the lesson and press play. Drag Bunny's slider far ahead: the picture must jump back to where she was, and "Edasi saab kerida kuni kohani, kuhu oled jõudnud." shows under the player. If the picture stays ahead, Bunny ignores `setCurrentTime`: the server clock still holds (next point), so write it in the ledger and in `docs/launch-checklist.md` §9.
     - Open Bunny's speed menu: its top entry must be 2×. If it offers more, remove the higher speeds in the library's player settings, or raise `TOP_SPEED` in `app/src/domain/lessons.ts` to the top speed and deploy again.
     - Play at 2× for about 30 s. Then read `select watched_sec, clock_at from lesson_progress where client_id = <id>` (read-only): `watched_sec` is about 60, never more than 2 × the time since the lesson was opened + 30.
     - Rewind and replay: nothing jumps.
  2. **The "Pooleli" card.** Her `/konto` shows the dark card with "Test 2c · <lesson>", the bar and "Jätka" (or "Alusta"); the e-course card shows "{done} / {total}".
  3. **One real welcome mail** (the spec's live check).
     - Dim sets Seaded → "Tervituskood" to a test code.
     - On https://mslab.ee he signs his own address up in the footer: his address goes in nowhere but the form.
     - He opens the confirmation link from his mailbox. The home page shows the confirmed notice with the code, and one "Tere tulemast MS LABi!" mail with the code arrives. Check that it renders in Gmail and that the code is selectable.
     - Opening the link again shows no code, and no second mail comes.
  4. **The newsletter popup.**
     - In Hüpikaken choose "Uudiskiri" and save.
     - In a private window, the home page shows the newsletter popup after 6 s. Do not sign up, or Dim's address gets a second subscription: close it.
     - Back in the admin, restore the choice noted in step 1 (Kampaania, or Väljas).
  5. **The password.**
     - As the sample client: Minu andmed → "Määra parool", saved.
     - Log out, then `/konto/sisene` → "Sisene parooliga" signs in with it.
     - A wrong one says "E-post või parool ei sobi.".
     - The sample address is never mailed, so the change mail is not checked here: the DB tests cover it.
  6. **Consent.** On a course page, register a sample `*.naidis@example.test` address with "Soovin MS LABi uudiseid ja pakkumisi" ticked. Railway then has its unconfirmed subscriber row, and the Õpilased drawer of a client with that address says "Uudiskiri: ootab kinnitust".
- [ ] **Step 9: Clean-up, by SQL and the admin.**
  - Delete the sample client's `lesson_progress` rows.
  - In the admin, delete the "Test 2c" lesson ("Kustuta õppetund": it removes the Bunny video) and the module, then "Lõpeta ligipääs".
  - Delete the sample registration and its subscriber row, the sample client's login tokens and the client row (phase 2a Task 11 step 7).
  - Delete Dim's subscriber row if he does not want the newsletter.
  - Set "Tervituskood" back to what Maria chooses (empty until she does).
  - Check the popup choice is Maria's again (step 8.4).
- [ ] **Step 10: Durations.** From the runtime logs, note the max and median of `POST /api/konto/parool-login` (one scrypt) and `GET /api/konto` (the dashboard with progress).
- [ ] **Step 11 (later, as planned in phase 3a): migration 0006** drops `courses.modules`, code first and then the migration, as the 3a plan's Task 12 step 11 now says. The migrations count afterwards is 7.

---
