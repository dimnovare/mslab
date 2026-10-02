# MS LAB phase 2a — client accounts and dashboard

Date: 2026-10-02 · Status: approved by Dim (with the simplicity rules in section 2.1)
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
| Linking | An account automatically shows every registration, waitlist entry and request ever made with the same e-mail (case-insensitive). New ones link at creation time. |
| "Loo mulle kohe konto" (P16) | Ticking it on a registration sends the login link right after the registration is stored. |
| Devices | **One device only.** A new login ends all other sessions of that client. The ended device sees "Sinu konto avati teises seadmes" and is sent to the login page. |
| E-courses before payments | Any admin grants access in the admin ("Ava ligipääs"). Access lasts the course's `accessMonths` from the grant. |
| Terms (S5, C54) | Before an e-course is opened the first time: notice that access is personal and must not be shared, plus "Olen tutvunud ja nõustun tingimustega". Acceptance is stored per client, course and terms version. |
| Client actions | Edit name, phone and language (ET/RU); newsletter on/off; "Soovin tühistada / muuta aega" on a contact registration (creates an admin request, changes nothing itself); delete account. |
| View as client | Admins open any client's dashboard read-only from "Õpilased", with a banner and every action disabled. |
| Dashboard design | Prototype B's dashboard (Maria, C34), with a simpler menu (C35). |
| Hosting | Stays on Cloudflare Workers **Free** (10 ms CPU per request). Paid plans are ruled out. |
| Audience | Brow and lash students who are not confident with computers, mostly on phones. Fewest possible steps; see section 2.1. |

## 2.1 Simplicity rules (Dim, binding for every screen and e-mail)

The users are brow and lash students, many not confident with computers, mostly on phones. Every flow is judged by the number of steps and the chance of confusion.

1. **Login without traps.** The login e-mail has a big 6-digit code **and** a button. The code works on the device where the student started (the usual confusion — opening the mail on the phone while the site is on the computer — disappears); the button works on the device that opens it. Code and link are valid **30 minutes**, single use. The login page remembers the last e-mail in this browser and pre-fills it.
2. **Stay logged in.** A session lasts 180 days and renews on use; the only thing that ends it is logging in on another device (one-device rule), "Logi välja" or account deletion.
3. **Signed out elsewhere = one tap back.** The message "Sinu konto avati teises seadmes" has one button "Saada uus kood" that sends a code to the same e-mail and opens the code field.
4. **No account set-up.** No password, no profile form, no confirmation step. The first login lands straight on "Minu koolitused" with everything already linked by e-mail. Name and phone come from the registration if present.
5. **Every course card says what to do next**, in one plain sentence plus at most one button: e.g. "Tasu ettemaks 175 € — vaata juhiseid", "Koolitus on kinnitatud. Kohtume 14.11 kell 10:00, Pärnu", "Ava koolitus". Prepayment instructions come from a new admin setting (receiver, IBAN, payment reference = registration number); if it is empty the card says "Maria saadab sulle arve".
6. **Few words, big targets.** Plain ET/RU, no jargon ("sessioon", "staatus", "ligipääs" only where unavoidable). Buttons ≥ 48 px high on phones, one primary button per card. Empty states explain the one thing to do ("Lisa koolitus lemmikuks ♡ koolituse lehel").
7. **Mobile first.** Designed at 390 px first; bottom tab bar with icons + labels; nothing needs horizontal scrolling except the swipeable course list.
8. **Forgiving forms.** E-mail is trimmed and lower-cased; obvious typos in common domains (gmial.com, gmail.ee …) get a "Kas mõtlesid …?" suggestion before sending. Errors say what to do, never only what went wrong.
9. **Dangerous actions are rare and clear.** Only "Kustuta konto" needs a confirmation; it sits at the very bottom of "Minu andmed".

## 3. Architecture — fit the Free plan

Personal pages cannot come from the shared page cache, and a server render costs 40–60 ms CPU. So the client area is split:

- **Shell pages** `/konto`, `/konto/lemmikud`, `/konto/andmed`, `/konto/kursus/[slug]`, `/konto/sisene` (and `/ru/…`) are ordinary cached pages: identical for every visitor, no personal data, served by the existing cache front.
- **Personal data** comes from small JSON endpoints under `/api/konto/*`, answered **in the Worker entry before OpenNext** (like `/media`), because OpenNext's own path alone costs 4–9 ms. Each call opens its own request-scoped Postgres client (closed with `ctx.waitUntil`), does at most two indexed queries and no React rendering. The same handler is also mounted as a Next route for `next dev`. Budget: **≤ 8 ms CPU per call**, measured on the deployed Worker.
- Client components fetch the JSON after load and show skeleton placeholders meanwhile. Unauthenticated → the shell redirects to `/konto/sisene` (client-side). "Replaced by another device" → a 401 with `reason: "replaced"` → the message, then the login page.
- Mutations are POSTs to `/api/konto/*` with the same Origin check the admin uses. No server actions here, because they render a page in the response.

## 4. Data model (new tables; Drizzle migration)

- `clients` — id, email (unique, lowercased), name, phone, locale (`et`/`ru`), created_at, deleted_at.
- `client_login_tokens` — hash (SHA-256 of a 256-bit token), code_hash (SHA-256 of the 6-digit code + per-token salt), email, expires_at (30 min), attempts, used_at. Single use (link or code, whichever comes first), consumed atomically; a code allows 5 wrong attempts, then the token is dead.
- `client_sessions` — id_hash, client_id, created_at, expires_at (180 days, sliding), ended_at, end_reason (`logout` / `replaced` / `deleted`). A login inserts a session and sets `ended_at = now, end_reason = 'replaced'` on every other open session of that client, in one transaction.
- `course_access` — client_id, course_id, granted_by (admin e-mail or `payment`), granted_at, expires_at, revoked_at.
- `terms_acceptances` — client_id, course_id, terms_version, accepted_at.
- `client_favourites` — client_id, course_id, created_at (unique pair).
- `registrations`, `requests`, waitlist rows, `subscribers`: add a nullable `client_id`, set on creation and backfilled on first login by e-mail match. Never relied on for authorisation without the e-mail match.
- New request type `change_request` (cancel or change date) with the registration id, shown in the admin inbox.

The terms text is a new `pages` key `course_terms` (ET/RU, edited in the admin); `terms_version` = its last-updated timestamp.

## 5. Login and sessions

- `/konto/sisene`: e-mail field (pre-filled from this browser) → POST `/api/konto/login` → the page switches to a 6-digit code field: "Saatsime koodi aadressile …". Always the same answer whether or not the address is known (no account enumeration). "Saada uuesti" after 60 s.
- Code → POST `/api/konto/code` (rate-limited per address and IP; 5 wrong tries end the token).
- Rate limits: the existing KV limiter per IP (/64) and per address (3 live links per address, as for the admin), plus a **global daily cap on outgoing login e-mails** (default 60/day, a counter row in Postgres, so it cannot fail open like the KV limits). This protects the Resend Free quota (100/day) shared with form notifications.
- Link → GET `/api/konto/verify?t=…`, or a correct code → consumes the token, creates the client if new, links earlier records, starts the session (ending others), sets cookie `__Host-mslab_client` (HttpOnly, Secure, SameSite=Lax, Path=/), redirects to `/konto` (or `/ru/konto` by the client's locale). Link-preview scanners: same handling as the admin link today.
- Logout: POST `/api/konto/logout` ends the session.
- Favourites merge: after login, the client sends its browser favourites once (`POST /api/konto/lemmikud/merge`), then the localStorage copy is cleared and hearts read and write the account while logged in.

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
- **Account deletion:** deletes the client, sessions, tokens, favourites, terms acceptances and access rows; sets `client_id = null` on registrations and requests (Maria keeps her booking records with the name and e-mail as given); unsubscribes the newsletter. An e-mail confirms the deletion.
- All strings ET + RU in the dictionaries; dict parity test stays green.

## 7. Admin

- Seaded gets "Ettemaksu juhised": receiver name, IBAN, bank, and the reference rule (default: registration number). Shown on unpaid contact-course cards.

- New section **Õpilased** (after Registreerimised): a list of clients (name, e-mail, created, number of courses), filter Kõik / E-õpe / Kontaktõpe (A4), search by name or e-mail, paging as in the inboxes.
- Client detail (drawer): their registrations, requests, e-course access, terms acceptances; actions:
  - "Ava ligipääs" (any admin; pick an e-course; expiry = now + accessMonths, editable) and "Lõpeta ligipääs"; the grant is logged with the admin's address;
  - **"Vaata tema vaadet"** → `/admin/opilased/[id]/vaade`: an admin page (server-rendered, admin-guarded; low traffic) that loads the client's dashboard data with the same loader as `/api/konto` and renders the same client components, inside a banner "Vaatad kliendi {nimi} vaadet — muuta ei saa". Every button is disabled; the client's sessions are untouched.
- The `change_request` type appears in the existing requests inbox with a link to the registration.
- All admin routes use the existing guards (`requireAdmin`, `withAdmin`, `adminAction` in `server/actions/admin*.ts`); the static guard test covers the new files.

## 8. E-mails (Resend, existing sender)

- Login e-mail: big 6-digit code + one button "Logi sisse" (ET/RU by the client's locale, else the page locale); subject contains the code.
- **New: registration confirmation to the visitor** (phase 1 only notified Maria): "Registreering on vastu võetud", the course and date, the next step (prepayment amount and instructions, or "Maria võtab sinuga ühendust" for individual requests), and a button "Ava minu konto" → `/konto/sisene` with the e-mail pre-filled. When "Loo mulle kohe konto" was ticked, the same e-mail also carries a live login code and button (30 min), so one tap logs them in. Waitlist and request confirmations get the same short form.
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
- Free-plan acceptance on the deployed Worker: `/api/konto` calls ≤ 8 ms CPU (measured with `wrangler tail`), shells served from the cache front (0–2 ms), `tools/cache-smoke.mjs` still passes.
- Sample data: the removable sample registrations (`@example.test`) are reused; a sample client can be viewed through "view as".

## 11. Open for later (not blocking 2a)

- Notifications to Maria (e-mail / Telegram) — asked from Maria separately; switching `MARIA_EMAIL` / the Telegram chat is a configuration change.
- Whether unpaid registrations hold a seat (affects 2b).
