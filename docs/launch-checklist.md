# MS LAB — from prototype to public launch

Phase 1 is live as a **prototype** on https://mslab.diipsolutions.eu (Worker `mslab-web`, Cloudflare Workers Free) for Dim and Maria only. This list collects everything that must happen before real visitors arrive (target domain mslab.ee, accounts under Maria's e-mail). Sources: the final whole-branch review and the build ledger of phase 1.

## 1. Accounts and switches
- [ ] Recreate Cloudflare (Worker, R2 `mslab-media` + `mslab-next-cache`, D1 tag cache, KV, Hyperdrive), Railway, Resend and the Telegram bot under Maria's accounts; move the data (Postgres dump, R2 objects, KV comments if still wanted).
- [ ] `SITE_URL` → https://mslab.ee; `LINK_ORIGINS`; custom domain `routes` in `app/wrangler.jsonc`.
- [ ] `MARIA_EMAIL` (a Worker secret: `npx wrangler secret put MARIA_EMAIL`) and the Telegram chat (`TELEGRAM_CHAT_ID` / KV `tg:chat`) → Maria's address (today: Dim's).
- [ ] `NEXT_PUBLIC_REVIEW_TOOLS` → "0" in `app/next.config.ts` (removes the review comment widget and its anonymous Telegram ping).
- [ ] Remove noindex: `X-Robots-Tag` in `next.config.ts`, the middleware, `public/_headers` and the cache front's `ROBOTS`; robots.txt; metadata `robots`.
- [ ] New OG image for the final home page (`public/og.jpg`; strip metadata with `tools/strip_provenance.py`).
- [ ] Regenerate `cf-typegen` after the vars change.
- [ ] Retire the old hub: Worker `mslab-guide`, `site/`, `worker/`, root `wrangler.jsonc` (rollback only; the hub itself now lives in the app).

## 1b. Domain, e-mail and Google (mslab.ee is at Elkdata today: DNS, MX, old site)
- [ ] Confirm with Maria: does a mailbox on mslab.ee exist (e.g. info@mslab.ee — MX points to Elkdata, but the mail service may not be ordered) and who can log in to Elkdata.
- [ ] Business Google account with the mslab.ee address as login (owned by Maria, Dim added as user/owner) for Search Console, Business Profile, Analytics if used.
- [ ] Search Console **now** on the current mslab.ee (Domain property, DNS TXT at Elkdata): collect the old site's indexed URLs and traffic → 301 redirect map from old WordPress URLs to the new pages at launch.
- [ ] Move mslab.ee DNS to Cloudflare (needed for the Worker custom domain) — copy every mail record first (MX, SPF, DKIM, DMARC) so e-mail keeps working.
- [ ] Site e-mail on `send.mslab.ee` in Resend (DKIM/SPF/return-path records), separate from the main mailbox. Do not use Resend as Maria's personal SMTP (shared 100/day free quota).
- [ ] Optional: mailbox in Gmail via forwarding + "Send mail as" through the mailbox host's SMTP.
- [ ] Analytics: prefer Cloudflare Web Analytics (free, cookieless, no consent banner) over GA4.

## 2. Stay inside the Free plan (owner rules out paid plans)
- [ ] Abuse/quota hardening: Turnstile (free) on public forms; a global daily cap on outgoing mail (Resend Free: 100/day); consider D1 counters instead of KV for rate limits (KV Free: 1,000 writes/day, limits fail open when exhausted); one Cloudflare rate-limiting rule or Bot Fight Mode for scanners.
- [ ] Cache housekeeping: R2 lifecycle rule on `mslab-next-cache` (old builds pile up; e.g. 7 days); stop storing 404 entries except the two `leidmata` pages (junk addresses create R2 writes).
- [ ] Measure once with `wrangler tail`: viewport prefetch on the home page (~30 internal links → Worker requests per first visit); admin create/delete `redirect()` self-fetch (two heavy invocations).
- [ ] Every Next / OpenNext upgrade: follow the rerun recipe in `app/tests/unit/versions.test.ts` (versions are pinned on purpose; the page cache depends on their internals).

## 3. Decisions for Maria
- [ ] Do unpaid (awaiting prepayment) registrations hold a seat? Then: capacity warning when confirming, and re-enable or keep off the public seat revalidation.
- [ ] CTA wording: hero "Leia **oma** koolitus" vs popup "Leia **enda** koolitus".
- [ ] Step/module numbers in JetBrains Mono — keep or switch to Jost.
- [ ] Newsletter CSV: comma or semicolon (Excel in Estonian locale).
- [ ] Video hosting for e-courses (est. 500 h): R2 + own HLS encoding (~$8–32/mo storage, free egress) vs Bunny Stream (~$11–20/mo + delivery) vs Cloudflare Stream (~$150/mo). Decide when the prototype is ready for testing; test with one real video.

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
- [ ] Verify `after()` work lands on the right request's `waitUntil` under concurrency (OpenNext global request context).
- [ ] `global-setup` cannot see a reused dev server's env → make `sendMail`/`sendTelegram` skip in development builds before `MARIA_EMAIL` points to Maria.
- [ ] Cache code (`page-store`, `public-cache`, `page-front`, cron in `worker.ts`) still logs R2/D1 error messages — switch to `logFailure`.

## 6. Phase 2 (engineering)
- [ ] Extract `usePublicForm` + `<Honeypot/>` before payment forms (six forms repeat the pattern).
- [ ] Delete the unused Task 5 write helpers in `src/db/queries/admin.ts` and `registrationSchema`.
- [ ] Migration with FK / token indexes; lowercase e-mails on write.
- [ ] e2e: guard Playwright `request`/`page.request` against non-GET on remote targets.
- [ ] `frame-ancestors 'none'` for admin if no same-origin framing is needed any more.
- [ ] CI drift check: `drizzle-kit generate` must produce no diff.
- [ ] R2 media deletion (uploads are never deleted today) — remember the edge copies are immutable for a year.
