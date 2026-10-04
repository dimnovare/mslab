# MS LAB — how the site is hosted and deployed

Since 03.10.2026 https://mslab.diipsolutions.eu runs on **Vercel**. The Cloudflare Workers that served it before (`mslab-web`, the app, and `mslab-guide`, the old design hub) are retired; nothing in the repository deploys them any more. This file is the current setup. It holds variable **names** only: values are never written in the repository (it is public), and the secrets are entered by Dim himself in the Vercel dashboard.

## 1. What runs where

| Part | Where |
|---|---|
| App (Next.js 16.3.8, `app/`) | Vercel project `mslab` on Dim's Hobby account (Maria's account later). Project settings: Root Directory `app`, Framework Next.js. Functions run in `fra1` (Frankfurt, `app/vercel.json`). |
| Domain | `mslab.diipsolutions.eu`, added to the Vercel project. DNS stays in the Cloudflare zone `diipsolutions.eu` (section 4). |
| Database | Railway Postgres, reached directly over its TCP proxy (`DATABASE_URL`, one postgres.js pool per function instance). Migrations are applied by hand (section 6). |
| Key-value data | The Postgres table `kv_entries` (review comments, form rate limits, the Telegram chat id), through `src/server/kv.ts`. |
| Uploaded images | Cloudflare R2 bucket `mslab-media`, through its S3 API (`src/server/r2.ts`), served by the app at `/media/img/<uuid>.<ext>`. Without the R2 variables `next dev` keeps images in `app/.media-local`; production then refuses uploads (503) and `/media` answers 404. |
| E-mail, Telegram | Resend (sender domain `send.diipsolutions.eu`) and the Telegram bot. |
| Design hub and prototypes | Static files of the app: `app/public/guide`, `app/public/p/<dir>`, `app/public/feedback.js`. The comment API is `/api/feedback`. |
| Page freshness | Next.js ISR. An admin save calls `revalidatePath` for the pages it changes (`src/server/cache-targets.ts`); pages that list course dates also revalidate every 300 s. |

The whole host is noindex (`X-Robots-Tag`, `frame-ancestors 'self'` and `Referrer-Policy` come from `headers()` in `app/next.config.ts`, the middleware adds its own on redirects) until the launch on mslab.ee.

## 2. Environment variables

Set in the Vercel project: Settings → Environment Variables (or `vercel env add <NAME> production`). A change reaches a deployment only when a **new** deployment is made. The build needs none of them: no page is prerendered from the database (`[locale]/layout.tsx` returns no static params on purpose; pages are rendered on the first request and then cached), and the start-up check runs when the server starts, not during the build, so `next build` succeeds with an empty environment. They are read at run time. Without a required variable every request answers 500 with an error that names the variable, never its value (`src/instrumentation.ts`, `src/server/env.ts`).

Required:

| Name | What it is for |
|---|---|
| `DATABASE_URL` | Railway Postgres connection URL (the TCP proxy URL, a password inside), ending in `?sslmode=require`: the proxy is reached over the internet and postgres.js encrypts only when the URL says so. Sensitive. |
| `SITE_URL` | The site's own address (no trailing slash): links in e-mails and Telegram messages, link-preview tags. Today `https://mslab.diipsolutions.eu`. |
| `ADMIN_EMAILS` | Sign-in allow-list of the admin, comma-separated. Personal addresses: only here, never in the repository. |
| `ADMIN_NAMES` | Greeting name per admin, `<address>=<name>`, comma-separated. |
| `MARIA_EMAIL` | Where form notifications go (Dim's address until the mslab.ee launch, then Maria's). |
| `MAIL_FROM` | The From header of outgoing mail, `MS LAB <address on the Resend domain>`. |

Optional (each switches a feature on):

| Name | What it is for |
|---|---|
| `RESEND_API_KEY` | Sending e-mail through Resend (sign-in links, notifications, newsletter). Without it nothing is sent and the admin cannot receive a link. Sensitive. |
| `TELEGRAM_BOT_TOKEN` | Telegram pings (new comment, new form). Sensitive. |
| `TELEGRAM_CHAT_ID` | The chat that gets the pings; overrides the id stored in `kv_entries` under `tg:chat`. |
| `ADMIN_KEY` | Access key of the review comment list `/guide/tagasiside/`. Sensitive. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | The image bucket. An R2 API token with Object Read & Write on `mslab-media`. All four or none (a partial set means no store, and the log names the missing ones). The two keys are sensitive. |
| `CRON_SECRET` | Authorises the daily cron (section 5). A long random string. Sensitive. |

Set by Vercel itself (do not set by hand): `VERCEL`, and `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, `VERCEL_URL`, which `src/server/site.ts` allows as the origin of links back to a preview or production host.

Local only, never on Vercel: `MEDIA_LOCAL` (a production build on this machine keeps images in a folder; ignored when `VERCEL` is set) and the `E2E_*` variables of the test runs. `app/.env.example` lists everything with placeholders for local development.

Preview deployments get only the variables that are enabled for the Preview environment. A preview that is given the production `DATABASE_URL` writes to the production data. None are enabled for Preview today (section 3 says what that means for previews).

## 3. Deploying

**Normal way (once the branch is merged into `main`).** The project's Git integration deploys `main` to production on every push, and any other branch or pull request to a preview URL (`*.vercel.app`, noindex like everything else). Nothing else is needed: the build is `next build` in `app/`. Database migrations are not part of it (section 6): apply a new one **before** the code that needs it goes live.

**Previews.** A preview deployment builds, but no Preview environment variables are set (section 2), so the start-up check fails and every page and API request answers **500** (static files under `app/public`, such as `/guide/`, may still load). That is harmless: it touches no database and is behind Deployment Protection. Do not "fix" it by enabling the production variables for Preview. If a working preview is ever wanted, give Preview its own database and variables.

**After the first Git deploy of `main`.** That build puts live the R2 request handling and logging written after the CLI deploy of 03.10.2026, so check these once (replace the host if it has changed):

1. A key that does not exist answers 404 within a second: `curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://mslab.diipsolutions.eu/media/img/00000000-0000-4000-8000-000000000000.jpg`. A request that hangs means the R2 call is stuck (see the canary in `app/tests/unit/r2.test.ts`).
2. An image that exists (take an `/media/img/…` address from a course page) answers 200 with `cache-control: public, max-age=31536000, immutable`. Ask twice with `curl -sI`: `x-vercel-cache` is `MISS`, then `HIT`. The app also sends `Vercel-CDN-Cache-Control` so that the CDN keeps the image, but Vercel strips that header from the answer, so the `HIT` is the evidence.
3. One admin upload: sign in at `/admin`, upload a small image in a picture field (the upload route answers 201) and open its `/media/img/…` address. Uploads are never deleted today, so use a small image.
4. One manual cron run: Settings → Cron Jobs → Run on `/api/cron/sweep` answers 200, and the runtime log shows `[cron] sweep: N expired kv entries deleted` (only the 401 case has been seen so far).
5. Then the read-only checks at the end of this section.

**Manual fallback (the Vercel CLI).** The CLI reads the `.vercelignore` of the folder it runs in, so it works from the **repository root**, where the root `.vercelignore` is applied (an `app/.vercelignore` is not read there, and a deploy from `app/` is refused: the project's Root Directory `app` would become `app/app`). The root file is an allow-list of what `next build` in `app/` reads: `app/src`, `app/public`, `app/drizzle` and six files (`package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `vercel.json`, `drizzle.config.ts`), about 450 files and 42 MB in October 2026. Everything else stays out, whatever lies around locally: `.wrangler`, `.open-next`, `.next`, `node_modules`, `.env*`, `.dev.vars*`, `.media-local`, test output and everything outside `app/` (`app/tests/unit/vercelignore.test.ts` guards this). It uploads the working tree, though, so uncommitted edits go up too. For a production deploy that is exactly the commit, deploy a clean copy of what is committed:

```
mkdir <scratch>
git archive HEAD app | tar -x -C <scratch>
mkdir <scratch>/.vercel && cp .vercel/project.json <scratch>/.vercel/
cd <scratch> && vercel deploy --prod
```

`.vercel/project.json` links the folder to the project (it is git-ignored; `vercel link` makes it). The CLI prints the deployment URL; the production alias moves to it when it is ready. `vercel rollback` or the dashboard (Deployments → a good one → Promote to Production) goes back to an earlier deployment.

After a deployment, check it read-only: `node tools/cache-smoke.mjs [base] [--only=A,B,C]` (A and B: 90 GET/HEAD requests over the main pages, the hub and a prototype, exit 1 on any answer that is not 2xx or 3xx, the `x-vercel-cache` counts printed; C: the client account's shells come from the cache without `set-cookie`, `/api/konto/me` answers 401 `private, no-store` and is never cached, a query on a shell gets a 303 into the fragment), and `E2E_BASE_URL=<site> E2E_ALLOW_REMOTE=1 npx playwright test headers --project=chromium` (from `app/`) for the headers. A run against a deployment is read-only: the form tests skip themselves and every POST is blocked.

## 4. DNS

The Cloudflare zone `diipsolutions.eu` has a `CNAME` record `mslab` → `cname.vercel-dns.com`, **DNS only** (grey cloud, not proxied). Vercel issues and renews the certificate itself. Keep the proxy off: a proxy in front would hand every visitor the same address in `x-forwarded-for`, and the form rate limits would share one bucket.

For another domain (mslab.ee at the launch): add it in Vercel (Settings → Domains), create the record Vercel shows, set `SITE_URL` and redeploy (see `docs/launch-checklist.md`).

## 5. The daily cron

`app/vercel.json` has one cron: `GET /api/cron/sweep` at 03:00 UTC every day (the Hobby plan allows daily crons only; the exact minute within the hour varies). It deletes the expired `kv_entries` rows, so the rate-limit counters, which hold visitors' addresses, are gone a day after their window at the latest even when nobody submits a form. Vercel sends `Authorization: Bearer <CRON_SECRET>`; with no `CRON_SECRET` set, or any other header, the route answers 401. Crons run on the production deployment only. Check it under Settings → Cron Jobs (a run can be started there) and in the runtime logs: `[cron] sweep: N expired kv entries deleted`.

## 6. Migrations on Railway

The SQL files are in `app/drizzle/` (additive: no migration drops or rewrites data). Vercel does not run them. To apply the pending ones to the Railway database, from `app/`:

```
DATABASE_URL='postgres://…@<host>.proxy.rlwy.net:<port>/railway?sslmode=require' npm run db:migrate
```

- Take the **public** TCP proxy URL from the Railway Postgres service (Connect → Public Network) and add `?sslmode=require`. Put it in the shell only: never in a file, never in the repository (`.env*` files are git-ignored, but an `.env` that a local `next dev` reads would then point the dev server at production data too).
- `drizzle-kit migrate` applies what is not yet recorded in its own table, in order. Check afterwards (`select count(*) from drizzle.__drizzle_migrations`).
- A new migration: change `src/db/schema.ts`, `npm run db:generate`, review and commit the SQL. Railway runs Postgres 18 (`ALTER TYPE … ADD VALUE` needs 12 or later).
- Order: migrate first, then deploy. An additive migration is harmless to the code that is live, so a rollback of the code (section 8) stays safe.

## 7. The database tools and their guards

All take the connection URL from `DATABASE_URL` in the shell and print counts only: never the URL, a key, a value or an address. Each says which database it means with `--target`, and refuses when the URL disagrees: `local` only for `localhost`, `127.0.0.1` or `::1`; `railway` only for a host ending in `.rlwy.net`, `.railway.app` or `.railway.internal` (`src/db/fill-ru.ts` `targetMatches`).

| Tool | What it does | Guards |
|---|---|---|
| `npm run db:seed -- [--target local\|railway] [--reset [--force]]` | Inserts the prototype content that is missing; existing rows are untouched. | Without `--target` it works on a local database only. `--reset` (deletes the content and the registrations) needs `--target`, and `--force` when registrations would be deleted. |
| `npm run db:demo -- --target railway\|local [--apply \| --remove]` | The removable sample registrations, requests and subscribers that make the admin look lived in. | `--target` is required. A dry run unless `--apply` or `--remove` is given. |
| `npm run db:copy-kv -- --target railway\|local --file <export.json> [--apply]` | The one-time copy of the review comments (`fb:*`, their `id:*` lookups and `tg:chat`) from the old Cloudflare KV namespace into `kv_entries`. The input is the namespace exported with `wrangler kv`: a JSON array of `{ name, value, expiration? }`. Rate-limit keys (`rl:*`) are never copied. | `--target` and `--file` are required. A dry run unless `--apply`; the apply is one transaction and idempotent (a second run changes nothing). The export holds the client's own text: keep it outside the repository and delete it after use. Done at the cutover (56 comments); needed again only if the Cloudflare site is revived. |
| `npx tsx src/db/fill-ru.ts --target railway\|local [--apply]` | Fills empty Russian sample texts of a database seeded before them. | `--target` is required; a dry run unless `--apply`. |

The test suites and the e2e run never write to Railway: they use PGlite and a local Postgres, and the e2e run refuses to start when any database setting points anywhere but this machine (`app/tests/e2e/local-db.ts`).

## 8. Rollback

1. **The code only.** Promote an earlier deployment (section 3). The database stays as it is; migrations are additive, so older code still runs.
2. **Back to Cloudflare.** The Worker `mslab-web` is still deployed with its bindings, detached from the domain. In Vercel remove `mslab.diipsolutions.eu` from the project (Settings → Domains); in the Cloudflare zone delete the `mslab` CNAME; then Workers & Pages → `mslab-web` → Settings → Domains & Routes → add the custom domain `mslab.diipsolutions.eu` (Cloudflare adds the DNS record itself). The Worker still reads the same Railway database through its Hyperdrive config, so content and registrations are current. Two things are not: the review comments written after the cutover are in `kv_entries` only (`db:copy-kv` cannot copy back, it only writes into `kv_entries`; a reverse copy would be a hand-written `wrangler kv bulk put` from an export of `kv_entries`), and the Worker's page cache (the R2 bucket `mslab-next-cache` and the D1 tags) still holds the pages it cached before the cutover, while saves made on Vercel since then wrote no tags there, so pages can be stale (those with `revalidate = 300` — home, course list, course pages, calendar, so the seat counts — for up to 5 minutes, the rest for up to a day) unless that cache is purged first (or the staleness is accepted). This only works while the Cloudflare resources exist: once they are deleted (the clean-up item of `docs/launch-checklist.md`), the only rollback is a Vercel deployment.

## 9. Hobby-plan limits to keep in mind

- 1 million function invocations a month and 100 GB of data transfer; an image is cached by Vercel's CDN (`Vercel-CDN-Cache-Control` on `/media`), the public pages by ISR.
- 4.5 MB request body: the upload limit in the app is 4 MB (the admin's browser shrinks images first).
- Cron jobs: once a day at most.
- A function that hangs would run for the plan's default 300 s: `/media` and the upload route set `maxDuration = 30`, and R2 gets 10 s to answer.
