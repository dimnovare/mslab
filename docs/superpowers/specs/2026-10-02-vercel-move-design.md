# MS LAB — move hosting from Cloudflare Workers to Vercel

Date: 2026-10-02 · Status: approved by Dim (Vercel Hobby on Dim's account now, Maria's account later; images stay on Cloudflare R2)

## Why
Cloudflare Workers Free allows 10 ms CPU per request; a server-rendered Next.js page needs 20–60 ms. The custom page cache made public pages fit, but admin pages and first renders after edits still get killed (Cloudflare error 1102/503), and the work-arounds (cache front, D1 tag cache, cron, exact version pins) add complexity. Vercel runs Next.js natively without a per-request CPU cap on Hobby.

## Decisions
| Topic | Decision |
|---|---|
| Hosting | Vercel Hobby, Dim's account, project from the public GitHub repo, root directory `app/`, functions in `fra1` (Frankfurt; Railway Postgres is in Europe). Later moved to an account of Maria's. |
| Domain | `mslab.diipsolutions.eu` → Vercel (DNS record in the Cloudflare zone, proxy off). The Cloudflare Worker `mslab-web` stays deployed but detached, as the rollback. |
| Database | Railway Postgres, connected directly (`DATABASE_URL`, Railway TCP proxy). Hyperdrive is no longer used. One postgres.js pool per function instance. |
| Page freshness | Next.js ISR on Vercel. Admin saves call `revalidatePath` for the affected pages (the existing change → pages map in `src/server/cache-targets.ts`). Pages that list course dates revalidate every 300 s so dates that have started drop off (replaces the Cloudflare cron; Vercel Hobby cron runs only daily). |
| KV data | A Postgres table `kv_entries` with a small adapter that keeps the existing KV interface (get/put with TTL/delete/list by prefix). Holds the review comments (56 + ids), rate limits and the Telegram chat id. The existing comments are copied over from Cloudflare KV. |
| Images | Cloudflare R2 bucket `mslab-media`, accessed through R2's S3 API with keys Dim creates and enters in Vercel himself. `/media/img/…` keeps its URLs; responses are immutable so Vercel's CDN serves repeats. Local development without keys uses a folder on disk. |
| Removed | OpenNext adapter and its config, the Worker entry and `src/worker/*`, the page store, the D1 tag cache, the session cron, Worker-only tests, Cloudflare runtime APIs in app code. |
| Kept | noindex everywhere, frame-ancestors, the trailing-slash/locale middleware, `/guide` and `/p/*`, the comment API contract, magic-link admin, all forms and notifications, the freshness contract (next request after "Salvesta" shows the change). |
| Phase 2a | Paused after its Task 1 (schema, platform-neutral). After the move, phase 2a Tasks 3–11 are rewritten for Vercel: ordinary Next pages and route handlers (no Worker-level API, no 10 ms budget). |
| Costs | Vercel Hobby $0 (limits: 1M function invocations/month, 100 GB transfer), Railway as today, R2 free tier. |

## Acceptance
- Locally: unit/DB/e2e green on `next dev` and on `next build && next start` (freshness, admin, forms, comments, media).
- On a Vercel preview: same checks read-only + the controller's signed-in admin pass (30 admin page loads, 0 errors).
- After the domain switch: public pages, `/ru`, `/guide/`, `/p/*`, admin login and editing, a comment reaching Telegram, an image upload, noindex headers, no AI tool names.
