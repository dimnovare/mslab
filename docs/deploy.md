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
| Lesson videos | A Bunny Stream library (section 10): Maria's browser uploads straight to Bunny (tus), students watch in Bunny's player inside the lesson page through an address the server signs. Nothing passes through Vercel. |
| Lesson files | The same R2 bucket under the **private** `lessons/` prefix, handed out as a short-lived signed address (a 302) after the access checks; `/media` refuses `lessons/` keys. The bucket must never be made public (section 10). |
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
| `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY` | The lesson videos on Bunny Stream (section 10): the library's id, its API key and its embed token-authentication key. All three or none: without them the admin's video field says "Video seadistamata" and students see "Video lisandub peagi". The two keys are sensitive and never reach a browser. |
| `BUNNY_WEBHOOK_SECRET` | The query secret of Bunny's webhook URL (`/api/bunny/webhook?secret=…`). Optional (the webhook only triggers a status read from Bunny's API), but set it. Sensitive. |
| `SITE_GATE` | The coming-soon gate (`src/lib/site-gate.ts`, hotfix 08.10): `1` and every visitor gets the coming-soon page (`app/tulekul/[locale]`) at every address; `/admin`, the sign-in, the cron, Bunny's webhook, the newsletter's confirm link, `/media` and the static files still answer; any other `/api` address is a 404 JSON for a script and the coming-soon page for a browser opening it (a mailed account link). Any value but `0`/`false`/`off`/`no` is on. The launch removes it (and redeploys). |
| `PREVIEW_SECRET` | The key of the admins' preview cookie `mslab_preview` (`src/lib/preview-cookie.ts`), set at sign-in and by "Vaata kodulehte" / "Vaata lehte ↗" in the admin (`/api/admin/preview`): with it an admin sees the whole site behind the gate. A long random string of at least 32 characters (a shorter one counts as not set). Without it, with `SITE_GATE` on, nobody gets past the coming-soon page. Changing it ends every admin's pass (they click "Vaata kodulehte" again). Sensitive. |

**When an admin leaves** (taken off `ADMIN_EMAILS`) while the gate is on: rotate `PREVIEW_SECRET` and redeploy. That ends their view of the site; the preview cookie is not tied to the session and would otherwise stay valid for up to 30 days.

Set by Vercel itself (do not set by hand): `VERCEL`, and `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, `VERCEL_URL`, which `src/server/site.ts` allows as the origin of links back to a preview or production host.

Local only, never on Vercel: `MEDIA_LOCAL` (a production build on this machine keeps images in a folder; ignored when `VERCEL` is set), `BUNNY_FAKE_URL` (the e2e run's fake Bunny server; ignored when `VERCEL` is set) and the `E2E_*` variables of the test runs. `app/.env.example` lists everything with placeholders for local development.

Preview deployments get only the variables that are enabled for the Preview environment. A preview that is given the production `DATABASE_URL` writes to the production data. None are enabled for Preview today (section 3 says what that means for previews).

## 3. Deploying

**Normal way (once the branch is merged into `main`).** The project's Git integration deploys `main` to production on every push, and any other branch or pull request to a preview URL (`*.vercel.app`, noindex like everything else). Nothing else is needed: the build is `next build` in `app/`. Database migrations are not part of it (section 6): apply a new one **before** the code that needs it goes live.

**Previews.** A preview deployment builds, but no Preview environment variables are set (section 2), so the start-up check fails and every page and API request answers **500** (static files under `app/public`, such as `/guide/`, may still load). That is harmless: it touches no database and is behind Deployment Protection. Do not "fix" it by enabling the production variables for Preview. If a working preview is ever wanted, give Preview its own database and variables.

**After the first Git deploy of `main`.** That build puts live the R2 request handling and logging written after the CLI deploy of 03.10.2026, so check these once (replace the host if it has changed):

1. A key that does not exist answers 404 within a second: `curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://mslab.diipsolutions.eu/media/img/00000000-0000-4000-8000-000000000000.jpg`. A request that hangs means the R2 call is stuck (see the canary in `app/tests/unit/r2.test.ts`).
2. An image that exists (take an `/media/img/…` address from a course page) answers 200 with `cache-control: public, max-age=31536000, immutable`. Ask twice with `curl -sI`: `x-vercel-cache` is `MISS`, then `HIT`. The app also sends `Vercel-CDN-Cache-Control` so that the CDN keeps the image, but Vercel strips that header from the answer, so the `HIT` is the evidence.
3. One admin upload: sign in at `/admin`, upload a small image in a picture field (the upload route answers 201) and open its `/media/img/…` address. Uploads are never deleted today, so use a small image.
4. One manual cron run: Settings → Cron Jobs → Run on `/api/cron/sweep` answers 200, and the runtime log shows `[cron] sweep: N expired kv entries, N login codes, N sessions, N mail counters, N stuck video uploads deleted, N stuck processing videos found ready, N marked failed, N video rows left for the next run`.
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

`app/vercel.json` has one cron: `GET /api/cron/sweep` at 03:00 UTC every day (the Hobby plan allows daily crons only; the exact minute within the hour varies). It deletes the expired `kv_entries` rows (the rate-limit counters, which hold visitors' addresses, are gone a day after their window at the latest even when nobody submits a form), the expired client login codes (they hold the address), client sessions ended or expired more than 30 days ago, and daily mail counters older than 7 days. With Bunny set up (section 10) it also gives up lesson videos left unfinished for a day, at most 20 of each kind a run, and no new video is started after 35 seconds of the run (a video begun is finished, which takes about 20 seconds at most, so the run stays under `maxDuration`; the rest wait for the next day, and the log says how many). Hobby's functions may run up to 300 s: the route's `maxDuration = 60` is our own guard. An upload still `uploading` 24 hours after it began is asked about at Bunny and, if it never arrived, given up (the lesson gets its replaced video back, or has none, and only after that write is the video deleted from Bunny); a video still `processing` 24 hours after its upload began is asked about, kept if Bunny says ready, and otherwise marked failed, so the admin shows "Töötlemine ebaõnnestus" with "Lae uuesti üles". A ready video is never touched, and a replaced video that still plays is deleted only once the new one is ready. Vercel sends `Authorization: Bearer <CRON_SECRET>`; with no `CRON_SECRET` set, or any other header, the route answers 401. Crons run on the production deployment only. Check it under Settings → Cron Jobs (a run can be started there) and in the runtime logs: `[cron] sweep: N expired kv entries, N login codes, N sessions, N mail counters, N stuck video uploads deleted, N stuck processing videos found ready, N marked failed, N video rows left for the next run` (counts only: no video ids, no addresses), and, when the 35 seconds ran out, `[cron] sweep: no new video row started after 35 s`. A Bunny failure on the status read of one video is logged as `[video] stuck … not swept: <error class>` and only then is the video tried again the next day. When the Bunny delete fails after the lesson's row was already reset, the row is not tried again: the log says `[lesson] video not deleted: <error class>` (no id) and the empty video stays in Bunny. Compare Bunny's library list with the lessons now and then, and delete what no lesson uses.

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
| `npm run db:seed -- [--target local\|railway] [--reset [--force]]` | Inserts the prototype content that is missing; existing rows are untouched. | Without `--target` it works on a local database only. `--reset` (deletes the content and the registrations) needs `--target`, and `--force` when registrations would be deleted. `--reset` also refuses, and `--force` does not help, while any lesson progress, course access, lesson video or lesson file exists: the cascade would delete the students' progress and access, and the Bunny videos and R2 files would stay behind with nobody able to delete them. The message (counts only) says what to do: remove lesson videos and files in the admin first; progress or access means this database has real students, so do not reset it and use a fresh database for a clean seed. |
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
- A function that hangs would run for the plan's default 300 s: `/media` and the upload route set `maxDuration = 30`, and R2 gets 10 s to answer. The same holds for Bunny's API (10 s an answer; the account API and the webhook set 30). The daily cron sets 60 as its own guard (Hobby allows up to 300 s): at most 20 video rows of each kind, and no new one after 35 s of the run (a row begun takes about 20 s at most to finish: 35 + 20 is under 60).
- A student watching a lesson posts her progress about every 15 s (about 240 function calls an hour of video); 500 hours watched a month is about 120 000 calls.

## 10. Bunny Stream (lesson videos)

The lessons' videos live in one Bunny Stream library. Maria's browser sends a video straight to Bunny (a resumable tus upload that the server signs; nothing passes through Vercel), Bunny encodes it, and students watch it in Bunny's player inside the lesson page, through an address the server signs for four hours. These steps are for Dim. The names below come from bunny.net/docs as read on 06.10.2026 and from the names of the library's API fields; the dashboard may word them a little differently, so **confirm each label on the first setup and correct this section where it differs**.

1. **Create the library.** bunny.net → Delivery → Stream → **Add Video Library**. Name it `mslab`. Pick a storage region in Europe. Bunny's quickstart advises two or more regions for durability; every extra region keeps another copy (the screen shows the price). A lost video can be uploaded again from Maria's own file, so start with no extra replication (Dim's choice).
2. **The two ids.** The library's **API** page: the **Video Library ID** → `BUNNY_LIBRARY_ID`; the **API Key** → `BUNNY_API_KEY`. Take the library's own key: not the read-only key next to it, and not the account key of bunny.net's account settings (the app sends the library key as `AccessKey`).
3. **Security** (the library's security settings; the API field of each is in brackets):
   - **Embed view token authentication** ON (`PlayerTokenAuthenticationEnabled`). Its key (the docs call it the token security key) → `BUNNY_TOKEN_KEY`. The app signs each address as `SHA256_HEX(key + video id + expiry)`, as Bunny's docs describe. **CDN token authentication** is a different setting (it protects the video files themselves): leave it as it is, the player in the iframe uses the embed token.
   - **Allowed domains** (`AllowedReferrers`): `mslab.diipsolutions.eu` now; at the mslab.ee launch add `mslab.ee` and `www.mslab.ee` (`docs/launch-checklist.md` section 8).
   - **Block direct URL file access** ON (probably `BlockNoneReferrer`: requests without a referrer are refused). The lesson page sends the site's origin as the referrer to the player (`Referrer-Policy: strict-origin-when-cross-origin`), so playback is not affected. If the player stays blank after this is switched on, this switch is the first suspect.
   - **MP4 fallback** OFF (`EnableMP4Fallback`), so there is no downloadable MP4.
   - **Direct play** OFF (`AllowDirectPlay`).
   - Leave **early play** (`AllowEarlyPlay`), JIT encoding and DRM off: the app treats a video as ready at status 4 (Finished).
4. **Player controls.** In the library's player settings the controls shown are a list (the API field `Controls`: `play-large, play, progress, current-time, mute, volume, captions, settings, pip, airplay, fullscreen`). Try taking **fullscreen** and **pip** (picture in picture) out of it (to confirm on the first setup: that the dashboard offers this list, and that the player really drops those two buttons). The lesson page has its own "Täisekraan", which keeps the watermark with the address in view; Bunny's own fullscreen button does nothing useful inside the page's frame, and picture in picture shows the video with no watermark. AirPlay hands the picture to another screen the same way: leave it out too. A list to try: `play-large,play,progress,current-time,mute,volume,settings`. Playback speeds: at most 2× (the speed menu's list): the server's progress clock assumes 2× is the top speed (phase 2c, `TOP_SPEED` in `app/src/domain/lessons.ts`).
5. **Webhook.** In the library's settings, the webhook URL (`WebhookUrl`): `https://mslab.diipsolutions.eu/api/bunny/webhook?secret=<BUNNY_WEBHOOK_SECRET>`. The secret is a long random string you make up (`openssl rand -hex 32`). The URL with its secret ends up in Vercel's request logs (accepted: it only lets someone ask the app to re-read a video's status). The webhook is a trigger and nothing more: the app reads the video's status from Bunny's API and never believes the body. Bunny also signs its webhooks (headers `X-BunnyStream-Signature` and friends, HMAC-SHA256 with the library's read-only API key); the app does not check that, it relies on the URL secret and on the re-read. Without a secret the app takes any call (still only a trigger), so set it. At the mslab.ee launch the host in this URL changes (`docs/launch-checklist.md` section 8).
6. **Vercel variables.** Settings → Environment Variables → **Production** (the API key, the token key and the webhook secret are sensitive: tick "Sensitive" for those three; the library id is not a secret; never `BUNNY_FAKE_URL`); they reach the site with the next deployment:

   | Variable | Where it comes from |
   |---|---|
   | `BUNNY_LIBRARY_ID` | The library's API page: Video Library ID (step 2). |
   | `BUNNY_API_KEY` | The library's API page: API Key (step 2). |
   | `BUNNY_TOKEN_KEY` | The library's security settings: the embed view token authentication key (step 3). |
   | `BUNNY_WEBHOOK_SECRET` | Optional, from nowhere: the random string of step 5. |

   `vercel env ls production` lists the names without values.
7. **Check after the deployment:** admin → an e-course → a lesson → the video field offers "Vali video" (not "Video seadistamata").

**What the app uses.** The API `https://video.bunnycdn.com/library/<id>/videos`, tus `https://video.bunnycdn.com/tusupload` (straight from Maria's browser) and the player `https://player.mediadelivery.net/embed/<id>/<video>?token=…&expires=…`. The library's CDN hostname is not needed (no thumbnails or direct files in this phase). An unfinished upload is looked after by the daily cron (section 5).

**Keep the R2 bucket private.** The bucket `mslab-media` holds the public images under `img/` **and** the private lesson files under `lessons/`. The images are served by the app (`/media/img/…`) and the lesson files only through a short-lived signed address after the access checks; `/media` refuses `lessons/` keys. So **never attach a public custom domain to the bucket and never turn on its public `r2.dev` address**: every lesson file would then be open to anyone who learns a key. If images are ever to be served straight from R2, move them to a bucket of their own first.

**Costs.** Pay-as-you-go: about €5–15 a month at about 500 hours (the spec's estimate). Look at Bunny's bill after the first month (`docs/launch-checklist.md` section 8).

**Moving to Maria's Bunny account later.** A new library and new variables, and the videos uploaded again (or moved with Bunny's help). The `lessons.video_id` values then change.

**First-use checks** (once, with the first real uploads; none of them can be done by a test, because the tests use a fake Bunny):

1. **The first real upload, with the browser console open.** In the admin, open DevTools (Console and Network) and upload a short video. The requests to `video.bunnycdn.com/tusupload` must succeed (the creating POST 201, the PATCH chunks 204) and the console must show no CORS error: the tus headers and Bunny's CORS answers were only tested against the fake server. Then "Töötlemisel…" turns into "Valmis · m:ss". Some browsers give no MIME type for an `.mkv` file; the field then says "Vali videofail." — use an mp4 or mov file.
2. **R2 keeps the file's name on a signed GET.** The app stores the name with the file (Content-Disposition) when the admin uploads a lesson file. As a student, "Lae alla" must save the file under its own name (not under the long key). If it comes down as a bare key, R2 dropped the header on the signed address.
3. **The player address answers without a redirect.** Copy the `src` of the lesson page's player frame from DevTools (it is valid for four hours; do not paste it anywhere) and run `curl -sI -H 'Referer: https://mslab.diipsolutions.eu/' '<src>'`: the answer must be `200`, not a `301` or `302`. The page takes the player's origin (for the progress messages) from that address, so a redirect to another host would break the check. In the same visit the player must show no fullscreen and no picture-in-picture button (step 4), and the same address without its `token` and `expires` must be refused, also in a private window. Also in this visit, press play and watch the Network tab: a progress POST (`/api/konto/kursus/…/progress`) must appear within about 15 s of playback, and "Video ei lae" must never cover a video that is playing. If it does, Bunny's player is not posting Player.js "ready" to the page: report it (nothing is lost for the student's completion, but the message hides a working video, and then the message should become a line under the frame instead of a cover).
4. **The shape of an upright phone clip** (plan 2026-10-05-phase3a, Task 12 step 4b). Upload one short clip filmed upright on a phone. Read `select video_width, video_height from lessons where video_id = '<guid>'` (from `app/`, with the Railway URL in the shell only: section 6; read-only): width must be smaller than height and the player's frame upright. If the frame comes out 16:9 with an upright picture inside, Bunny already reports the turned size: delete the quarter-turn swap in `shownSize` (`app/src/server/bunny.ts`) and the `bunny.test.ts` cases that pin it, and redeploy. A ready video must have a shape at all (a null shape plays as 16:9).
