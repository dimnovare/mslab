# MS LAB phase 2a — client accounts and dashboard

Date: 2026-10-02 · Status: approved by Dim (with the simplicity rules in section 2.1) · Hosting parts updated 03.10.2026 for the move to Vercel Hobby
Builds on: `2026-10-01-main-site-phase1-design.md` (phase plan, section 1). Requirements: checklist rows S1–S5, S7 (account part), P6, P16, A4 (students) in `docs/feedback/2026-10-01-checklist.md`.

## 1. Scope

Phase 2 of the original plan is split:

- **2a (this spec):** client accounts with e-mail login (link or code), the "Minu koolitused" dashboard, favourites in the account, e-course access granted by an admin, terms acceptance before an e-course, profile/newsletter/cancellation request/account deletion, admin "Õpilased" with read-only "view as client", the related e-mails.
- **2b (later, own spec):** Montonio payments — e-course purchase, contact-course 100 % / 50 % prepayment, automatic confirmation at ≥ 50 %. Starts when Maria has a Montonio contract. 2b creates the same e-course access and payment records that 2a shows.
- Phase 3 (lessons, video, tests, assessment, certificates) and phase 4 (invoices, contracts, reviews, newsletter campaigns) are unchanged.

Non-goals for 2a: taking payments, lesson content (e-courses show "Sisu lisandub peagi"), invoices and certificates (their menu items stay hidden until they exist), passwords, social login.

## 2. Decisions (from the design conversation)

| Topic | Decision |
|---|---|
| Who gets an account | Anyone, through an e-mail login link. The first successful login creates the account. No separate sign-up form. |
| Linking | An account automatically shows every registration, waitlist entry and request ever made with the same e-mail (case-insensitive). New ones link at creation time. The account's name and phone come from them while its own are empty (never over what the client saved). |
| "Loo mulle kohe konto" (P16) | Ticking it on a registration sends the login link right after the registration is stored. |
| Devices | **One device only.** A new login ends all other sessions of that client. The ended device sees "Sinu konto avati teises seadmes" and is sent to the login page. |
| E-courses before payments | Any admin grants access in the admin ("Ava ligipääs"). Access lasts the course's `accessMonths` from the grant. |
| Terms (S5, C54) | Before an e-course is opened the first time: notice that access is personal and must not be shared, plus "Olen tutvunud ja nõustun tingimustega". Acceptance is stored per client, course and terms version. |
| Client actions | Edit name, phone and language (ET/RU); newsletter on/off; "Soovin tühistada / muuta aega" on a contact registration (creates an admin request, changes nothing itself); delete account. |
| View as client | Admins open any client's dashboard read-only from "Õpilased", with a banner and every action disabled. |
| Dashboard design | Prototype B's dashboard (Maria, C34), with a simpler menu (C35). |
| Hosting | Vercel **Hobby** (project `mslab`, functions in Frankfurt `fra1`, `docs/deploy.md`), Railway Postgres, R2 for images. Paid plans are ruled out. Limits that shape 2a: 1M function invocations a month, 4.5 MB request body, cron jobs at most daily, 100 GB data transfer; Resend Free sends 100 mails a day. |
| Audience | Brow and lash students who are not confident with computers, mostly on phones. Fewest possible steps; see section 2.1. |

## 2.1 Simplicity rules (Dim, binding for every screen and e-mail)

The users are brow and lash students, many not confident with computers, mostly on phones. Every flow is judged by the number of steps and the chance of confusion.

1. **Login without traps.** The login e-mail has a big 6-digit code **and** a button. The code works on the device where the student started (the usual confusion — opening the mail on the phone while the site is on the computer — disappears); the button works on the device that opens it. Code and link are valid **30 minutes**, single use. The login page remembers the last e-mail in this browser and pre-fills it.
2. **Stay logged in.** A session lasts 180 days and renews on use; the only thing that ends it is logging in on another device (one-device rule), "Logi välja" or account deletion.
3. **Signed out elsewhere = one tap back.** The message "Sinu konto avati teises seadmes" has one button "Saada uus kood" that sends a code to the same e-mail and opens the code field.
4. **No account set-up.** No password, no profile form, no confirmation step. The first login lands straight on "Minu koolitused" with everything already linked by e-mail. Name and phone come from the registration if present.
5. **Every course card says what to do next**, in one plain sentence plus at most one button: e.g. "Tasu ettemaks 175 € — vaata juhiseid", "Koht on kinnitatud." (the date, time and place are on the card's own line), "Ava koolitus". Prepayment instructions come from a new admin setting (receiver, IBAN, payment reference = registration number); if it is empty the card says "Maria saadab sulle arve".
6. **Few words, clear targets.** Plain ET/RU, no jargon ("sessioon", "staatus", "ligipääs" only where unavoidable). One primary button per card, using the site's existing button styles (touch targets ≥ 44 px, the current rule). Empty states explain the one thing to do ("Lisa koolitus lemmikuks ♡ koolituse lehel").
7. **Mobile first.** Designed at 390 px first; bottom tab bar with icons + labels; nothing needs horizontal scrolling except the swipeable course list.
8. **Forgiving forms.** E-mail is trimmed and lower-cased; obvious typos in common domains (gmial.com, gmail.ee …) get a "Kas mõtlesid …?" suggestion before sending. Errors say what to do, never only what went wrong.
9. **Dangerous actions are rare and clear.** Only "Kustuta konto" needs a confirmation; it sits at the very bottom of "Minu andmed".
10. **Same design as the site (Dim).** Simplicity means fewer steps and words, not a new look: the client area follows the current design rules — prototype B's dashboard (`app/public/p/b`), the public site's components, fonts (Jost/Manrope), colour tokens and button styles. No new visual language.

## 3. Architecture — fit the Hobby plan

Personal pages cannot come from the shared page cache, and rendering a page for every visit would cost a function invocation each time (Hobby: 1M a month) and bring personal data next to cached pages. So the client area is split:

- **Shell pages** `/konto`, `/konto/lemmikud`, `/konto/andmed`, `/konto/kursus/[slug]`, `/konto/sisene` (and `/ru/…`) are ordinary static pages: identical for every visitor, no personal data, and on the server they never read cookies, headers or the query string. Vercel's CDN serves them like the other public pages (ISR) without rendering them per visit, and no personal data can ever enter a shared cache.
- **Personal data** comes from small JSON endpoints under `/api/konto/*`: one ordinary Next route handler (`app/api/konto/[[...path]]/route.ts`) that hands the request to a framework-free router (`handleAccountApi`, which the tests drive without Next). Each call uses the app's shared Postgres pool, runs a few small indexed queries (in parallel where they are independent) and no React rendering, and answers with `Cache-Control: private, no-store`. E-mails and notifications go out after the response (`after()`).
- Client components fetch the JSON after load and show skeleton placeholders meanwhile. Unauthenticated → the shell redirects to `/konto/sisene#valja=1` (client-side; the mark stops the login page from sending a stale hint cookie back). "Replaced by another device" → a 401 with `reason: "replaced"` → the message, then the login page.
- Mutations are POSTs to `/api/konto/*` with the same Origin check the admin uses. No server actions here, because they render a page in the response.

## 4. Data model (new tables; Drizzle migration)

- `clients` — id, email (unique, lowercased), name, phone, locale (`et`/`ru`), created_at. Deleting an account deletes the row (section 6).
- `client_login_tokens` — hash (SHA-256 of a 256-bit token), code_hash (SHA-256 of the 6-digit code + per-token salt), email, expires_at (30 min), attempts, used_at. Single use (link or code, whichever comes first), consumed atomically; a code allows 5 wrong attempts, then the token is dead.
- `client_sessions` — id_hash, client_id, created_at, expires_at (180 days, sliding), ended_at, end_reason (`logout` / `replaced`; deleting the account deletes its sessions). A login inserts a session and sets `ended_at = now, end_reason = 'replaced'` on every other open session of that client, in one transaction.
- `course_access` — client_id, course_id, granted_by (admin e-mail or `payment`), granted_at, expires_at, revoked_at.
- `terms_acceptances` — client_id, course_id, terms_version, accepted_at.
- `client_favourites` — client_id, course_id, created_at (unique pair).
- `registrations`, `requests`, waitlist rows, `subscribers`: add a nullable `client_id`, set on creation (the INSERT looks the account up by the normalised e-mail, `FOR KEY SHARE`, so a deletion at the same moment leaves the new row unlinked instead of failing it) and backfilled on first login by e-mail match. Never relied on for authorisation without the e-mail match.
- The daily `/api/cron/sweep` deletes expired `client_login_tokens` (they hold the address in plain text), sessions ended or run out more than 30 days ago, and `mail_quota` rows older than 7 days.
- New request type `change_request` (cancel or change date) with the registration id, shown in the admin inbox.

The terms text is a new `pages` key `course_terms` (ET/RU, edited in the admin); `terms_version` = its last-updated timestamp.

## 5. Login and sessions

- `/konto/sisene`: e-mail field (pre-filled from this browser) → POST `/api/konto/login` → the page switches to a 6-digit code field: "Saatsime koodi aadressile …". Always the same answer whether or not the address is known (no account enumeration). "Saada uus kood" after 60 s; after it, one neutral line "Kui kirja ei tule, proovi poole tunni pärast uuesti." (an address with 3 live logins gets no new mail). A browser that is signed in already (the hint cookie) is sent on to `/konto` (`/ru/konto` by the page's language), unless the fragment has `viga`, `korda`, `kood` or `valja`, or an `email` other than the one this browser signed in with.
- Page parameters are fragments, never a query: on the login page `#viga=link` / `#viga=server`, `#korda=1`, `#email=…`, `#email=…&kood=1` (opens the code step, sends nothing) and `#valja=1`; `#sisse` on `/konto` after a link login, `#salvestatud` after a language change in Minu andmed, `#konto-kustutatud` on the home page after a deletion. The browser reads them (`location.hash`; no `useSearchParams`) and removes them. A query on a shell gets a 303 from the middleware to the same path, with `viga`, `korda`, `email` and `kood` moved into the fragment and `Cache-Control: no-store` (a regenerated shell would otherwise keep the query for every visitor).
- Code → POST `/api/konto/code` (rate-limited per address and IP; 5 wrong tries end the token).
- Rate limits: the existing limiter per IP (/64) — a fixed-window counter in the Postgres table `kv_entries` (`src/server/ratelimit.ts`, `src/server/kv.ts`) — and per address (3 live links per address, as for the admin), plus a **global daily cap on outgoing login e-mails** (default 60/day, a counter row in Postgres raised in one conditional statement, so it cannot fail open the way the rate limits do when their store fails). The visitor confirmations (section 8) share the counter: one with a login code counts against 60, one without against 30 (each comes with Maria's own notification, which is not counted), and an address gets at most 3 a day. This protects the Resend Free quota (100/day) shared with form notifications.
- Link → GET `/api/konto/verify?t=…`, or a correct code → consumes the token, creates the client if new, links earlier records, starts the session (ending others), sets cookie `__Host-mslab_client` (HttpOnly, Secure, SameSite=Lax, Path=/), redirects to `/konto#sisse` (or `/ru/konto#sisse` by the client's locale); a used or old link goes to `/konto/sisene#viga=link`. Link-preview scanners: same handling as the admin link today.
- Logout: POST `/api/konto/logout` ends the session.
- Favourites merge: after login, the client sends its browser favourites once (`POST /api/konto/lemmikud/merge`), then the browser's own list is cleared. While logged in the hearts write the account and read its copy in localStorage (`mslab-account-fav`: refreshed on every account load, cleared on logout, a 401, deletion and every login).

## 6. Client area (prototype B base)

- **Menu (C35):** three items — Minu koolitused · Lemmikud · Minu andmed — and an avatar menu with "Logi välja". Phones: a sticky bottom tab bar (≥ 44 px targets). Invoices and certificates are not shown until their phases.
- **Minu koolitused (S4):** one card per course:
  - contact registration — course, date, time, city and venue, status (awaiting prepayment / confirmed / cancelled), paid and remaining amount, the prepayment rule text, and "Soovin tühistada / muuta aega" (opens a short form → `change_request`);
  - individual-course and practice requests — what was asked, status (new / handled);
  - waitlist entries — session and position-free status text;
  - e-course with access — access-until date and "Ava koolitus". The first open shows the terms notice (blocking), then the course page with its module list and "Sisu lisandub peagi".
  - Filter chips Kõik / Pooleli / Läbitud as in B, reduced to what has meaning now (Kõik / Tulevased / Möödunud).
  - Course cards scroll horizontally with touch swipe on phones (global swipe rule).
- **Lemmikud (S3):** the client's favourite courses as course cards; ♡ removes.
- **Minu andmed:** name, phone, language; newsletter on/off (subscribes as confirmed with the account e-mail, since the login proved the address; off = unsubscribe); "Kustuta konto" with confirmation.
- **Account deletion:** deletes the client, sessions, tokens, favourites, terms acceptances and access rows; sets `client_id = null` on registrations and requests (Maria keeps her booking records with the name and e-mail as given); unsubscribes the newsletter. An e-mail confirms the deletion; the browser lands on the home page with "Konto on kustutatud." (`#konto-kustutatud`).
- All strings ET + RU in the dictionaries; dict parity test stays green.

## 7. Admin

- Seaded gets "Ettemaksu juhised": receiver name, IBAN, bank, and the reference rule (default: registration number). Shown on unpaid contact-course cards.

- New section **Õpilased** (after Registreerimised): a list of clients (name, e-mail, created, number of courses), filter Kõik / E-õpe / Kontaktõpe (A4), search by name or e-mail, paging as in the inboxes.
- **"Lisa õpilane"**: an admin adds a client by e-mail (no session, no mail), so access can be granted to someone who has never logged in (an e-course paid by bank transfer). The new client takes the language, name and phone of the address's newest registration or request and links its records; her first login finds her.
- Client detail (drawer): their registrations, requests, e-course access, terms acceptances; actions:
  - "Ava ligipääs" (any admin; pick an e-course; expiry = now + accessMonths, editable) and "Lõpeta ligipääs"; the grant is logged with the admin's address;
  - **"Vaata tema vaadet"** → `/admin/opilased/[id]/vaade`: an admin page (server-rendered, admin-guarded; low traffic) that loads the client's dashboard data with the same loader as `/api/konto` and renders the same client components, inside a banner "Vaatad kliendi {nimi} vaadet — muuta ei saa". Every button is disabled; the client's sessions are untouched.
- The `change_request` type appears in the existing requests inbox with a link to the registration.
- All admin routes use the existing guards (`requireAdmin`, `withAdmin`, `adminAction` in `server/actions/admin*.ts`); the static guard test covers the new files.

## 8. E-mails (Resend, existing sender)

- Login e-mail: big 6-digit code + one button "Logi sisse" (ET/RU by the client's locale, else the page locale); subject contains the code.
- **New: registration confirmation to the visitor** (phase 1 only notified Maria): "Registreering on vastu võetud", the course and date, the next step (prepayment amount and instructions, or "Maria saadab sulle arve …"), and a button "Ava minu konto" → `/konto/sisene#email=…` (the e-mail pre-filled; a signed-in browser goes straight on to `/konto`). When "Loo mulle kohe konto" was ticked, the same e-mail also carries a live login code and button (30 min), so one tap logs them in, and a small link `/konto/sisene#email=…&kood=1` for typing the code. Waitlist and request confirmations get the same short form with their dashboard card's sentence ("Oled ootenimekirjas. …", "Päring on saadetud. Maria vastab peagi."). Caps: section 5.
- Account deleted.
- All recipients are the client's own address; nothing goes to Maria except the existing notifications and the new `change_request` notification.

## 9. Security and privacy

- Client and admin sessions are separate cookies and tables; a client cookie never grants admin access and vice versa. "View as" is admin-only and read-only.
- Every `/api/konto/*` read is scoped to the session's client id; record linking always re-checks the e-mail match.
- No PII in logs (`logFailure`). Tokens and session ids are stored only as hashes.
- No real e-mail addresses in the repository (unit guard); seed and tests use `@example.test`.

## 10. Testing and acceptance

- Unit/DB (PGlite): token issue/consume/expiry/reuse; one-device rule (second login ends the first with `replaced`); linking by e-mail incl. case; access grant/expiry/revoke; terms acceptance per version; deletion unlinks but keeps registrations; daily mail cap; guard coverage.
- E2E (desktop + mobile, local fixtures, Dim-only admin sign-in): login via dev link and via code (wrong code ×5 kills the token); e-mail pre-fill; "Saada uus kood" from the signed-out-elsewhere message; next-step sentence per card state; typo suggestion; dashboard shows the sample registrations of that address; favourites merge; terms notice blocks until accepted; change request reaches the admin inbox; profile edit; account deletion; second-device message; admin grant access → client sees the e-course; "view as" shows the same cards with disabled buttons; swipe on the phone course list.
- Hobby-plan acceptance on the deployed site (https://mslab.diipsolutions.eu): the `/konto…` shells come from Vercel's CDN (`x-vercel-cache` HIT, PRERENDER or STALE, no `set-cookie`); `/api/konto/*` answers `Cache-Control: private, no-store` and is never cached (`/api/konto/me` without a session: 401); `tools/cache-smoke.mjs`, extended with the shells (part C: shells from the cache, `/api/konto/me` never cached, a query on a shell answered with a 303 into the fragment), still passes; the `/api/konto*` function durations are read from Vercel's runtime logs and noted.
- Sample data: the removable sample registrations (`@example.test`) are reused; a sample client can be viewed through "view as".

## 11. Open for later (not blocking 2a)

- Notifications to Maria (e-mail / Telegram) — asked from Maria separately; switching `MARIA_EMAIL` / the Telegram chat is a configuration change.
- Whether unpaid registrations hold a seat (affects 2b).
