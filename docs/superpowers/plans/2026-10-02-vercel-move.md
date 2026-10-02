# MS LAB — Move to Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the MS LAB Next.js app on Vercel Hobby instead of Cloudflare Workers, with the same behaviour, data and URLs.

**Architecture:** Replace every Cloudflare runtime dependency with a platform-neutral one — `process.env` config, a direct Postgres pool, a Postgres-backed KV adapter, R2 through its S3 API — then remove the OpenNext/Worker caching layer and rely on Next.js ISR on Vercel.

**Tech Stack:** Next.js 16.3.8, React 19, TypeScript, Drizzle + postgres.js (Railway), `aws4fetch` (R2 S3 API), Vitest/PGlite, Playwright, Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-10-02-vercel-move-design.md`.

## Global Constraints

- Branch `feat/phase2a-client-accounts` (phase 2a Task 1 schema is already on it; migrations continue from `0001_client_accounts`). No pushes to `main` until Task 7.
- After this plan, no app code imports `@opennextjs/cloudflare`, `cloudflare:*`, `R2Bucket`, `KVNamespace`, `D1Database` or calls `getCloudflareContext` (a unit test enforces it in Task 4).
- Behaviour parity: every existing unit/DB/e2e test that is not Worker-specific stays green; freshness contract (the next public request after an admin save shows the change) is tested in `next build && next start` mode.
- noindex on every response (`X-Robots-Tag: noindex, nofollow`, robots.txt unchanged), `frame-ancestors 'self'`, `Referrer-Policy: strict-origin-when-cross-origin` — now all from `next.config.ts` `headers()`.
- Secrets never in the repo; R2 keys are entered by Dim himself; the repo is public (address guard stays green).
- Tests and tools never write to Railway; the controller applies migrations and copies KV data (Task 6/7) with target guards.
- Local DB only for tests; kill only your own processes; no deploys until Task 7 (controller).
- Commits: Conventional, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Postgres-backed KV

**Files:**
- Create: `app/src/server/kv.ts`; migration `app/drizzle/0002_kv_entries.sql` (via `npx drizzle-kit generate --name kv_entries`)
- Modify: `app/src/db/schema.ts` (+ `kvEntries`), every KV user: `src/server/feedback.ts`, `src/server/login.ts`, `src/server/notify.ts`, `src/server/submit.ts`, `src/server/ratelimit.ts` (type only), `src/app/api/feedback/*`, `src/server/actions/public.ts`
- Test: `app/tests/db/kv.test.ts` (+ existing ratelimit/feedback/notify tests keep passing on the new adapter)

**Interfaces:**
- Produces: `kvEntries` table `{ key: text pk, value: text not null, expiresAt: timestamptz null }`; `class PgKv implements TextKv & FeedbackKv` with `get(key)`, `put(key, value, { expirationTtl? })`, `delete(key)`, `list({ prefix, cursor?, limit? })` returning `{ keys: { name: string }[]; list_complete: boolean; cursor?: string }` (the same shape the code uses from Cloudflare KV); `serverKv(): PgKv` (uses `getDb()`).

- [ ] **Step 1: Failing test** `tests/db/kv.test.ts`:

```ts
import { expect, test } from "vitest";
import { makeTestDb } from "./helpers";
import { PgKv } from "@/server/kv";

test("get/put/delete with TTL", async () => {
  const kv = new PgKv(await makeTestDb(), () => new Date("2026-10-02T10:00:00Z"));
  await kv.put("a", "1");
  await kv.put("b", "2", { expirationTtl: 60 });
  expect(await kv.get("a")).toBe("1");
  expect(await kv.get("b")).toBe("2");
  const later = new PgKv((kv as unknown as { db: never }).db, () => new Date("2026-10-02T10:01:01Z"));
  expect(await later.get("b")).toBeNull();
  await kv.delete("a");
  expect(await kv.get("a")).toBeNull();
});

test("list by prefix with cursor, oldest key order", async () => {
  const kv = new PgKv(await makeTestDb());
  for (let i = 0; i < 5; i++) await kv.put(`fb:2026-10-0${i}`, String(i));
  await kv.put("id:x", "fb:2026-10-00");
  const first = await kv.list({ prefix: "fb:", limit: 3 });
  expect(first.keys.map((k) => k.name)).toEqual(["fb:2026-10-00", "fb:2026-10-01", "fb:2026-10-02"]);
  expect(first.list_complete).toBe(false);
  const rest = await kv.list({ prefix: "fb:", cursor: first.cursor });
  expect(rest.keys).toHaveLength(2);
  expect(rest.list_complete).toBe(true);
});
```

- [ ] **Step 2: Implement** `kv_entries` in the schema, generate the migration (additive only), then `src/server/kv.ts`:

```ts
import { and, asc, eq, gt, isNull, like, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { kvEntries } from "@/db/schema";

/** The Cloudflare-KV-shaped store the forms, comments and notifications use, kept in Postgres. */
export class PgKv {
  constructor(private readonly db: Db, private readonly now: () => Date = () => new Date()) {}
  private live() { return or(isNull(kvEntries.expiresAt), gt(kvEntries.expiresAt, this.now())); }
  async get(key: string): Promise<string | null> {
    const [row] = await this.db.select({ value: kvEntries.value }).from(kvEntries).where(and(eq(kvEntries.key, key), this.live())).limit(1);
    return row?.value ?? null;
  }
  async put(key: string, value: string, opts: { expirationTtl?: number } = {}): Promise<void> {
    const expiresAt = opts.expirationTtl ? new Date(this.now().getTime() + opts.expirationTtl * 1000) : null;
    await this.db.insert(kvEntries).values({ key, value, expiresAt }).onConflictDoUpdate({ target: kvEntries.key, set: { value, expiresAt } });
  }
  async delete(key: string): Promise<void> { await this.db.delete(kvEntries).where(eq(kvEntries.key, key)); }
  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 1000, 1000);
    const rows = await this.db.select({ key: kvEntries.key }).from(kvEntries)
      .where(and(like(kvEntries.key, `${(opts.prefix ?? "").replace(/[\\%_]/g, "\\$&")}%`), this.live(), opts.cursor ? gt(kvEntries.key, opts.cursor) : undefined))
      .orderBy(asc(kvEntries.key)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const done = rows.length <= limit;
    return { keys: page.map((r) => ({ name: r.key })), list_complete: done, cursor: done ? undefined : page.at(-1)!.key };
  }
}

export const serverKv = (): PgKv => new PgKv(getDb());
```

Adjust the `FeedbackKv` type in `feedback.ts` if it uses fields `PgKv` lacks; expired rows are swept opportunistically (`delete … where expires_at < now()` on 1 % of `put` calls).

- [ ] **Step 3:** Swap every `env.KV` use for `serverKv()` (or pass `PgKv` through the existing deps objects — tests already inject fakes); keep `TG_CHAT_KEY` semantics. Run all unit/DB tests; commit `feat(kv): Postgres-backed KV store`.

---

### Task 2: Server config and the database client without Cloudflare

**Files:**
- Create: `app/src/server/env.ts`
- Modify: `app/src/db/client.ts`, every `getCloudflareContext()` user (see the list in the controller note), `app/.dev.vars.example` → `app/.env.example`
- Test: `app/tests/unit/env.test.ts`, existing tests

**Interfaces:**
- Produces: `serverEnv(): ServerEnv` — typed read of `process.env` with `DATABASE_URL`, `SITE_URL`, `ADMIN_EMAILS`, `ADMIN_NAMES`, `MARIA_EMAIL`, `MAIL_FROM`, `RESEND_API_KEY?`, `TELEGRAM_BOT_TOKEN?`, `TELEGRAM_CHAT_ID?`, `ADMIN_KEY?`, `R2_ACCOUNT_ID?`, `R2_ACCESS_KEY_ID?`, `R2_SECRET_ACCESS_KEY?`, `R2_BUCKET?`; throws a clear error naming only the missing variable (never values) when a required one is absent.
- `getDb()` → one module-level postgres.js pool (`max: 5`, `connect_timeout: 5`, `idle_timeout: 20`) from `DATABASE_URL`; the per-request scope (`perRequest()`) falls back to React `cache()` when no request scope exists (Next's own per-request scoping on Node); no `sql.end()`.

- [ ] Steps: failing unit tests (missing var names, optional vars), implement, replace all `getCloudflareContext().env.X` with `serverEnv().X`, run all tests, commit `refactor: server config from process.env; direct Postgres pool`.

---

### Task 3: Images through R2's S3 API

**Files:**
- Create: `app/src/server/r2.ts` (`aws4fetch`; `r2Put(key, bytes, contentType)`, `r2Get(key)` → `{ body, contentType } | null`), local fallback `app/src/server/media-local.ts` (folder `app/.media-local/`, git-ignored) used when the R2 variables are absent
- Modify: `app/src/server/media.ts` (`putImage`, `serveMedia` use the store interface instead of `R2Bucket`), `app/src/app/media/[...key]/route.ts` (same validation, headers `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, noindex), `app/src/app/api/admin/upload/route.ts`, `package.json` (+ `aws4fetch`)
- Test: `app/tests/unit/media-upload.test.ts`, `app/tests/unit/media.test.ts` (adapted to the store interface with an in-memory fake), `app/tests/unit/r2.test.ts` (signed request shape with a fake `fetch`)

- [ ] Steps: failing tests, implement, keep key validation (`img/<uuid>.<jpg|png|webp>`) and magic-byte checks unchanged, run tests, commit `feat(media): R2 through the S3 API, local folder in development`.

---

### Task 4: Remove the Cloudflare layer; Next.js ISR

**Files:**
- Delete: `app/worker.ts`, `app/src/worker/*`, `app/open-next.config.ts`, `app/src/server/page-store.ts`, `app/src/server/tag-cache.ts`, `app/src/server/request-start.ts` (if only used by the front), Worker-only tests (`page-front`, `media-front`, `page-store`, `tag-cache`, `versions`, `wrangler-config`, `e2e-local-cache`, `request-scope` where Worker-specific, `tests/d1-sqlite.ts`, `tests/e2e/local-cache.ts`)
- Modify: `app/src/server/public-cache.ts` (each `CacheTarget` → `revalidatePath(path, type)`; no D1 rows, no settle write), `app/next.config.ts` (remove `initOpenNextCloudflareForDev`; headers from `public/_headers` moved here: noindex for every path, `frame-ancestors 'self'`, `Referrer-Policy`), delete `app/public/_headers`, pages that list course dates (`[locale]/(site)/page.tsx`, `koolitused/page.tsx`, `koolitused/[slug]/page.tsx`, `koolituskalender/page.tsx`) → `export const revalidate = 300`; `package.json` scripts (`build` = `next build`, remove `build:cf`/`deploy`/`cf-typegen`/preview scripts; remove `@opennextjs/cloudflare`, `wrangler` dev-deps only if nothing else uses them), `app/wrangler.jsonc` stays until Task 7 (rollback), `tests/e2e/target.ts` (`E2E_PROD_BUILD=1` now means `next build && next start`), `playwright.config.ts`
- Create: `app/vercel.json` (`{ "regions": ["fra1"] }`), `app/tests/unit/no-cloudflare.test.ts` (fails if any file under `app/src` imports `@opennextjs/cloudflare` or uses `getCloudflareContext`, `R2Bucket`, `KVNamespace`, `D1Database`)

- [ ] Steps: write `no-cloudflare.test.ts` (fails now), remove/replace, adapt `cache.spec.ts` to Next's own headers (`x-nextjs-cache: HIT|STALE|MISS` under `next start`) and keep the freshness e2e (admin edit → next public request shows it) in prod mode, run full unit/DB + local e2e (`next dev`) + prod-mode e2e (`next build && next start`), commit `refactor: run on Next.js ISR without the Cloudflare layer`.

---

### Task 5: Headers, hub and routing parity check

**Files:**
- Modify: `app/tests/e2e/headers.spec.ts` (+ assertions for static files: `/guide/`, `/p/d/`, `/og.jpg`, `/robots.txt`, `/feedback.js` carry `x-robots-tag` and `frame-ancestors` in prod mode), `app/src/middleware.ts` only if a parity gap appears
- Test: run `headers`, `feedback`, `pages`, `home`, `shell` specs in prod mode

- [ ] Steps: e2e first, fix gaps, commit `test: headers and hub parity on next start`.

---

### Task 6: KV data copy tool

**Files:**
- Create: `app/src/db/copy-kv.ts` + `npm run db:copy-kv` (reads a JSON export file produced by `wrangler kv key list` + `get`, writes to `kv_entries`; dry run by default; `--target railway` must match the URL like `fill-ru.ts`; copies `fb:*`, `id:*`, `tg:chat`; skips `rl:*`; idempotent)
- Test: `app/tests/db/copy-kv.test.ts`

- [ ] Steps: failing tests (dry run counts, apply, idempotent, refuses mismatched target), implement, commit `feat(tools): copy the review comments from Cloudflare KV`.

---

### Task 7: Vercel project, data, preview, domain (controller with Dim)

- [ ] Dim: `npx vercel login`; creates an R2 API token (Object Read & Write, bucket `mslab-media`) and enters `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in the Vercel project's Environment Variables himself; re-enters `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_KEY` (values are not readable from Cloudflare).
- [ ] Controller: `vercel link` (root `app`), set non-secret env vars (`SITE_URL`, `MAIL_FROM`, `ADMIN_EMAILS`, `ADMIN_NAMES`, `MARIA_EMAIL`, `TELEGRAM_CHAT_ID` from KV) and `DATABASE_URL` piped from the Railway CLI (never printed).
- [ ] Controller: apply migrations `0001` and `0002` to Railway (check Postgres ≥ 12 for `ALTER TYPE … ADD VALUE`); export Cloudflare KV and run `db:copy-kv --target railway` (dry run, then apply; expect 56 comments).
- [ ] Controller: push the branch → Vercel preview; on the preview: public pages, `/ru`, `/guide/`, `/p/*`, admin login + 30 admin page loads (0 errors), an edit shows on the next public request, a comment reaches Telegram, an image upload round trip, headers.
- [ ] Controller: merge to `main` (fast-forward), push; production deploy; add `mslab.diipsolutions.eu` to the Vercel project; in the Cloudflare zone detach the Worker custom domain and add the DNS record Vercel asks for (proxy off); verify the same list on the domain; keep Worker `mslab-web` deployed (rollback = re-attach).
- [ ] Controller: update `docs/launch-checklist.md` and project memory (hosting = Vercel; Cloudflare = DNS, R2, old hub Worker).
