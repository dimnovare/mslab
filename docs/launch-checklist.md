# MS LAB — from prototype to public launch

Phase 1 is live as a **prototype** on https://mslab.diipsolutions.eu (Vercel Hobby, project `mslab`; how it is set up and deployed: `docs/deploy.md`) for Dim and Maria only. This list collects everything that must happen before real visitors arrive (target domain mslab.ee, accounts under Maria's e-mail). Sources: the final whole-branch review and the build ledger of phase 1, and the clean-up after the move from Cloudflare Workers to Vercel (03.10.2026).

The switches below are **Vercel environment variables** (Project → Settings → Environment Variables, or `vercel env add`), not wrangler settings. A change reaches the site with the next deployment, so redeploy after changing one.

## 1. Accounts and switches
- [ ] Recreate Vercel (the project `mslab`, its Git integration, domain and environment variables), Cloudflare (R2 bucket `mslab-media` and the DNS zone only), Railway, Resend and the Telegram bot under Maria's accounts; move the data (Postgres dump, R2 objects). The review comments already live in Postgres (`kv_entries`).
- [ ] `SITE_URL` → https://mslab.ee (Vercel env var). `mslab.ee` and `www.mslab.ee` are already in the link allow-list (`FIXED_LINK_ORIGINS` in `app/src/server/site.ts`); add the domain to the Vercel project and make the DNS record it asks for (`docs/deploy.md` section 4).
- [ ] `MARIA_EMAIL` (Vercel env var) and the Telegram chat (`TELEGRAM_CHAT_ID`, or the `tg:chat` row in `kv_entries`) → Maria's address (today: Dim's).
- [ ] **Rotate the Telegram bot token** (BotFather `/revoke` gives a new one) and update `TELEGRAM_BOT_TOKEN` on Vercel; redeploy. The current token was copied to Vercel while the site moved.
- [ ] `NEXT_PUBLIC_REVIEW_TOOLS` → "0" in `app/next.config.ts` (removes the review comment widget and its anonymous Telegram ping).
- [ ] Remove noindex: the `X-Robots-Tag` rule in the `headers()` of `app/next.config.ts` (keep `frame-ancestors` and `Referrer-Policy`), `ROBOTS` in `app/src/middleware.ts` (its redirects set their own header), `public/robots.txt`, the `robots` metadata of the pages; check the headers on the deployment afterwards.
- [ ] New OG image for the final home page (`public/og.jpg`; strip metadata with `tools/strip_provenance.py`).
- [ ] **Delete the unused Cloudflare resources**, once the Vercel site has run without trouble for a while (this ends the Worker rollback of `docs/deploy.md` section 8): the Workers `mslab-web` and `mslab-guide`, the Hyperdrive config, the D1 database `mslab-next-tags`, the R2 bucket `mslab-next-cache`, and the KV namespace (its comments were copied to `kv_entries`; keep nothing but the DNS zone and the R2 bucket `mslab-media`, which holds the uploaded images). **Before deleting the KV namespace**, export it once more and run `db:copy-kv --target railway --file <export>` as a dry run (no `--apply`): every family must show `new 0` and `would be overwritten 0`, otherwise a comment written to the old site between the first copy and the cutover is still missing. Delete the KV export file afterwards.

## 1b. Domain, e-mail and Google (mslab.ee is at Elkdata today: DNS, MX, old site)
- [ ] Confirm with Maria: does a mailbox on mslab.ee exist (e.g. info@mslab.ee — MX points to Elkdata, but the mail service may not be ordered) and who can log in to Elkdata.
- [ ] Business Google account with the mslab.ee address as login (owned by Maria, Dim added as user/owner) for Search Console, Business Profile, Analytics if used.
- [ ] Search Console **now** on the current mslab.ee (Domain property, DNS TXT at Elkdata): collect the old site's indexed URLs and traffic → 301 redirect map from old WordPress URLs to the new pages at launch.
- [ ] Point mslab.ee (and www) at Vercel with the records Vercel shows (an A record for the apex, a CNAME for www). Moving the whole DNS zone to Cloudflare is optional now (the Worker custom domain was the reason): if it is moved, copy every mail record first (MX, SPF, DKIM, DMARC) so e-mail keeps working, and keep the web records DNS only.
- [ ] Site e-mail on `send.mslab.ee` in Resend (DKIM/SPF/return-path records), separate from the main mailbox. Do not use Resend as Maria's personal SMTP (shared 100/day free quota).
- [ ] Optional: mailbox in Gmail via forwarding + "Send mail as" through the mailbox host's SMTP.
- [ ] Analytics: prefer a cookieless one (Vercel Web Analytics on Hobby, or Cloudflare Web Analytics' script, which works without proxying the site) over GA4. Check the Hobby quota first.

## 2. Stay inside the free plans (owner rules out paid plans)
Vercel Hobby limits that matter here: **1 million function invocations a month**, **100 GB of transfer a month**, **4.5 MB request body** (the image upload limit in the app is 4 MB), **cron jobs once a day at most** (the one cron, `/api/cron/sweep`, is daily). Railway and Resend have their own quotas (Resend Free: 100 mails a day).
- [ ] **Check Vercel's terms for the launch**: the Hobby plan is meant for personal, non-commercial use. A public business site that sells courses may fall outside it; read the current terms (and ask Vercel if unsure) before real visitors arrive. If Pro turns out to be required, that is a decision for Dim: the owner has ruled out paid plans so far.
- [ ] After the first weeks of traffic read Vercel → Usage (invocations, transfer, ISR writes) against the limits. The home page prefetches about 30 internal links per first visit; pages served from the ISR cache are cheap, the admin and the API routes are invocations. A scanner asking for made-up slugs under `koolitused/`, `uudised/` or `ostukorv/` costs one invocation and one ISR write per address (each gets its own cached 404), and so does one under `konto/kursus/` (each gets its own cached account shell); other unknown paths are rewritten to `/leidmata` and do not.
- [ ] Abuse/quota hardening: Turnstile (free) on public forms; a global daily cap on outgoing mail (Resend Free: 100/day); the rate limits now live in Postgres (`kv_entries`, Railway), so a flood of form posts costs invocations and database writes: a Vercel Firewall rule (or Attack Challenge Mode) for scanners.
- [ ] Every Next.js upgrade (the version is pinned): run the unit tests, in particular the canary in `app/tests/unit/r2.test.ts` (it fails with a message when Next changes the fetch behaviour the R2 workaround depends on), and the production-build e2e (`E2E_PROD_BUILD=1`, which tests the freshness contract: the next public request after an admin save shows the change). That run depends on `app/tests/e2e/page-cache.cjs`, which wraps Next's own file cache through an internal module (`next/dist/…/file-system-cache.js`) and has no unit test of its own: if Next moves those internals the production e2e fails loudly, so fix the wrapper there. The R2 canary builds Next's fetch by hand and cannot see how a new version wires it, so also check once the upgrade is live: a missing `/media` key answers 404 within a second (`docs/deploy.md` section 3).

## 3. Decisions for Maria
- [ ] Do unpaid (awaiting prepayment) registrations hold a seat? Then: capacity warning when confirming, and re-enable or keep off the public seat revalidation.
- [ ] CTA wording: hero "Leia **oma** koolitus" vs popup "Leia **enda** koolitus".
- [ ] Step/module numbers in JetBrains Mono — keep or switch to Jost.
- [ ] Newsletter CSV: comma or semicolon (Excel in Estonian locale).
- [ ] Video hosting for e-courses (est. 500 h): R2 + own HLS encoding (~$8–32/mo storage, free egress) vs Bunny Stream (~$11–20/mo + delivery) vs Cloudflare Stream (~$150/mo). Vercel Hobby's 100 GB transfer rules out serving video from Vercel itself. Decide when the prototype is ready for testing; test with one real video.

## 4. Content
- [ ] Native-speaker review of all Russian texts (UI dictionary and the drafted sample content); RU city names.
- [ ] Real photos and texts from Maria (originals, not Telegram-compressed); trainer works gallery with her own work.
- [ ] Three dark hero slides on the current DB: phone focal point ≈ 90% in /admin/avaleht.
- [ ] ET copy pass ("1 kuud" for accessMonths = 1, etc.).

## 5. Polish and robustness (accepted for the prototype)
- [ ] Unsaved-changes warning on in-admin navigation (beforeunload only today).
- [ ] Slide/FAQ field errors keyed by index (wrong row after reorder).
- [ ] Newsletter confirm via GET (mail scanners) → interstitial with a POST button; rotate/hash the token.
- [ ] Static guard: `"use server"` only under `server/actions`.
- [ ] Scroll-lock layout shift on Windows (`scrollbar-gutter: stable`).
- [ ] Accessibility: explainer card focus; FavouriteButton double announce; "Eemalda lemmikutest" only in `title`.
- [ ] `keepNamesTogether` joins 3+ Title-case words (join pairs only); RU waitlist pill 1 px past the row border at ≥1000 px.
- [ ] Check in the Vercel runtime logs that the work scheduled with `after()` (the sign-in e-mail, the form notifications) completes when many requests arrive together: no mail missing from a burst.
- [ ] `global-setup` cannot see a reused dev server's env → make `sendMail`/`sendTelegram` skip in development builds before `MARIA_EMAIL` points to Maria. The same blind spot covers uploads: a reused dev server that was started with `R2_*` in its shell writes the e2e's uploads to the real bucket.
- [ ] Render race after an admin save: a page that is requested between the database write and the revalidation can be cached stale until the next revalidation (accepted: no cheap fix in Next 16.3.8). Option: shorten the layout's safety-net revalidation after checking the Hobby ISR write quota.

## 6. Phase 2 (engineering)
- [ ] Extract `usePublicForm` + `<Honeypot/>` before payment forms (six forms repeat the pattern).
- [ ] Delete the unused Task 5 write helpers in `src/db/queries/admin.ts` and `registrationSchema`.
- [ ] Migration with FK / token indexes; lowercase e-mails on write.
- [ ] e2e: guard Playwright `request`/`page.request` against non-GET on remote targets.
- [ ] `frame-ancestors 'none'` for admin if no same-origin framing is needed any more.
- [ ] CI drift check: `drizzle-kit generate` must produce no diff.
- [ ] R2 media deletion (uploads are never deleted today) — remember Vercel's CDN copies of `/media` images are immutable for a year (a deleted image can stay visible there until the copy expires).

## 7. Phase 2a (client accounts)
From the final review of phase 2a (04.10.2026); the merge-blocking items were fixed on the branch.
- [ ] One counter for every mail the site sends (logins, confirmations, Maria's notifications, deletion and change-request mails, admin logins, newsletter confirmations): a hard cap of about 95 a day with a share per kind, and the 3 000 a month. Until then confirmations without a code stop at 30 a day (M1).
- [ ] Check live that the login and confirmation mails arrive and render (big code, one button) in Gmail, Outlook.com and an Estonian ISP mailbox, and whether a mail scanner's plain GET uses up the login link and code (and, one device only, ends the student's session). If it does, the link opens a "Logi sisse" page that POSTs, like the newsletter interstitial in §5 (M2).
- [ ] iPhone Safari deletes localStorage after 7 days without a visit while the cookies stay: a signed-in student's "Ava minu konto" then shows the login form instead of her account (safe fallback). Fix: with the hint set and nothing remembered, forward to `/konto#email=…` and let the dashboard compare with `client.email`.
- [ ] Shared device: the remembered address is the last one a code was asked for, not the signed-in one (B asks for a code and leaves; B's "Ava minu konto" then opens A's account). Keep the signed-in address in its own key, written only from account answers.
- [ ] Watch Vercel Usage for made-up slugs under `konto/kursus/` (each renders and caches its own shell; §2's scanner note) (M3).
- [ ] Decide Maria's reply address and set `replyTo` on the visitor mails; replies go to the unread sending address today (M5).
- [ ] Native-speaker pass on the Russian account texts and mails: «лист ожидания» vs «списке ожидания», "оплатите предоплату" → "внесите предоплату", the request mail's "Запрос отправлен. Мария скоро ответит." (M6).
- [ ] `admin-auth.spec` under `E2E_PROD_BUILD=1`: skip its devLink tests there, and delete leftover admin tokens in `global-setup` (they block the admin sign-in for 15 minutes) (M9).
- [ ] `clients.email` lower-case enforced by the database (a CHECK or a unique `lower()` index), with §6's migration (triage row 4).
- [ ] Partial unique index `client_sessions(client_id) where ended_at is null`: the one-device rule in the schema too (row 8).
- [ ] `set local lock_timeout` at `lockAddress`, so a stuck lock cannot hold a request for its whole 30 s (row 10).
- [ ] Accessibility: the account banner (`role=status`) is inserted with its text and may not be announced; add it to §5's list (row 29).
- [ ] Probe live whether a cached 404 page keeps an unknown address's query (task-11 probe 5); if it does, strip queries on unknown addresses with a 303 (row 40).
- [ ] Õpilased list turns into cards below about 1360 px, Maria's laptop width; check on her screen (row 45).
- [ ] Admin copy: "(mustand) (avatud kuni …)" has two pairs of brackets in the grant select (row 49).
- [ ] Maria fills "Ettemaksu juhised" in Seaded (until then every unpaid card and mail says "Maria saadab sulle arve …").
- [ ] Maria saves the real "E-koolituse tingimused" text in Seaded before the first real "Ava ligipääs" (the seeded one ends "(Näidistekst — Maria täiendab.)").
- [ ] Before renaming `middleware` to `proxy` (a Next 16 build warning): the 303 shell defence lives there; rerun the task-11 probes after any rename.
- [ ] Watch the logs for `[account] login request rate limited`: the per-IP login limits (10 and 20 per 10 minutes) may bite students behind a mobile carrier's shared address (CGNAT).

## 8. Phase 3a (lessons and video)
- [ ] Dim creates the Bunny Stream library and sets `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY` (and `BUNNY_WEBHOOK_SECRET`) in Vercel Production before the 3a deploy (`docs/deploy.md` section 10); without them the admin says "Video seadistamata" and students "Video lisandub peagi".
- [ ] First live uploads: the four first-use checks of `docs/deploy.md` section 10 (the browser console during the first upload, R2 keeping the file name on a signed download, the player address answering without a redirect, the shape of an upright phone clip).
- [ ] mslab.ee launch: add `mslab.ee` and `www.mslab.ee` to the Bunny library's allowed domains and change the host of the webhook URL (`docs/deploy.md` section 10).
- [ ] Maria's own Bunny account later: a new library, new variables, the videos uploaded again; the `lessons.video_id` values change (`docs/deploy.md` section 10).
- [ ] After the first month read Bunny's bill (the estimate is about €5–15 a month at 500 hours watched) and Vercel's function invocations (a watching student makes about 240 progress calls an hour).
- [ ] Migration 0006 (drops `courses.modules`) only after 3a has run for a few days with no rollback planned: the code first, then the migration (plan 2026-10-05-phase3a, Task 12 step 11).
- [ ] Accepted limit: the iPhone's own full-screen video player shows no watermark (the page's "Täisekraan" keeps it).
- [ ] Accepted limit: a student can fake her progress. A video lesson counts as done when the playhead reaches 90 % of the video, which is not the same as 90 % watched: dragging the slider to the end also completes it, as does a script that reports the progress. It only opens her own next lessons. Do not read "done" as "watched" (decide before the certificate phase whether completion should need continuous playback).
- [ ] Accepted limit: the player's height is capped to leave room for the buttons below it (about 400 px reserved, 240 to 540 px high), so on a small laptop screen, with a 4:3 video or a lesson title that runs to two lines, "Täisekraan" can sit below the fold.
- [ ] Bunny's embed host is `player.mediadelivery.net` (the old `iframe.mediadelivery.net` player goes in early 2027): nothing to do, noted.

## 9. Phase 2c (Maria's feedback of 06.10.2026)
- [ ] Native-speaker check of the Russian texts phase 2c added: `account.lesson.seekLocked`, the `account.dashboard` resume texts (`resumeTag` … `finished`), `newsletter.popupSent`, `newsletter.codeLine`, `mail.welcome.*`, `forms.newsletterConsent`, `account.passwordMail.*`, `account.details.password.*`, and the login page's password texts (`account.login.toPassword` … `passwordLocked`).
- [ ] Maria fills Seaded → "Tervituskood" (empty: no welcome mail and no code on the confirmed page) and applies the code on her invoice.
- [ ] Maria chooses in Hüpikaken what the home page shows (Kampaania / Uudiskiri / Väljas); the newsletter popup's picture is a sample one until she uploads her own.
- [ ] Bunny's speed menu must stop at 2×: the server's progress clock assumes it (`TOP_SPEED` in `app/src/domain/lessons.ts`). If Bunny ever offers more, raise the factor to the top speed.
- [ ] Accepted: a password is optional and per address; there is no "forgot password" link (the code login is the way back); admins have no passwords.
