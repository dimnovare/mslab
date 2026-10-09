# MS LAB Phase 2c — Maria's 06.10 feedback (design)

Status: approved by Dim on 08.10.2026 (brainstorming). Builds on phase 2a (client accounts) and phase 3a (lessons, video, progress), both live.

## 1. Scope

One spec for the small and medium items of Maria's feedback of 06.10.2026 (Dim chose "1 and 2 together"):

1. Video: no seeking forward past the furthest point watched (rewind and speed stay).
2. Look: menu font, equal page titles, the home page's news block on a light band, a footer of about half the height, a dashboard progress card.
3. A second popup type, "Uudiskiri" (newsletter signup), and a welcome code sent after confirmation.
4. Marketing consent on the registration forms.
5. An optional password for students, next to the e-mail code.

Out of scope (later phases): practice and training protocols with the student feedback form (phase 3c, its own spec), the knowledge test (3b), the certificate (3d), sending newsletters (4), the rest of prototype B's dashboard (contact day, balance, protocol, certificate), passwords for admins, the move to mslab.ee (account migration, not code).

## 2. Decisions (Dim, 08.10.2026)

| Topic | Decision |
|---|---|
| Order | Items 1 and 2 of the phase table in one spec; protocols next. |
| Welcome code | Given **after** the e-mail is confirmed (welcome mail and the confirmed page), never in the popup itself. |
| Menu font | Jost, like the headings. |
| Password login | The e-mail code stays the default; a quiet "Sisene parooliga" opens e-mail + password. |
| Video | Forward seeking stops at the furthest point watched; rewind always; speed-up allowed (Maria, 06.10). This also settles the 3a question "should completion need continuous playback": yes. |

## 3. Video: no seeking forward

**Player** (`LessonPlayer.tsx`, `player-js.ts`):
- On every `timeupdate`, if the second is more than **3 s** beyond `furthest`, the page sends Player.js `setCurrentTime(furthest)` to the embed and does not raise `furthest`. Otherwise `furthest = max(furthest, second)` as today.
- After a jump back, a line under the player (polite live region) says **"Edasi saab kerida kuni kohani, kuhu oled jõudnud."**; it goes away after 6 s.
- `ended` sets `furthest` to the duration only if `furthest` is already within 5 s of the end.
- Resume (`t=` in the signed address) is unchanged.

**Server** (the progress endpoint, `lesson-data.ts`):
- New column `lesson_progress.clock_at` (timestamptz): set when the lesson is opened (the lesson GET upserts the row for a video lesson: `watched_sec` unchanged, `clock_at = now()`) and on every accepted progress post.
- A progress post may raise `watched_sec` by at most **`(now − clock_at) × 2 + 30` seconds** (2 = the top playback speed). A higher value is **clamped** to that limit, not refused (late or out-of-order posts stay harmless). `greatest()`, the 90 % rule and the `durationSec + 5` bound stay.
- With no `clock_at` (rows written before this phase), the first post only sets `clock_at` and may raise `watched_sec` by 30 s.

The server cap is the real rule: even if Bunny's player ignored `setCurrentTime`, a student could scrub the picture forward but could not complete the lesson faster than about half its length in real time. Live check after deploy: the embed obeys `setCurrentTime` and Bunny's speed menu stops at 2×; if it offers more, the factor follows the top speed.

## 4. Look

- **Menu:** `.navLink` and the phone menu use `var(--font-display)` (Jost) instead of Manrope; size and weight tuned so the line keeps its height (desktop ≈ 16px/400).
- **Page titles:** one shared class (`ui.pageTitle`) with the size of "Leia oma koolitus." (`clamp(34px, 4vw, 52px)` / 1.06, Jost 400, the catalogue's letter-spacing) for the H1 of Koolitused, Koolituskalender, Praktika, Koolitaja and Uudised. Eyebrows stay where they are.
- **Home news block:** `BlogCarousel`'s section becomes a full-width band in `var(--canvas)` like `FormatsBlock` (direct child of `<main>`, content in `ui.wrap`); cards on the light band in the existing light card style. Everything else on the home page stays.
- **Footer** (about half of today's ≈ 880 px at 1440 wide, target ≤ 460 px):
  - one block, two columns: left (≈ 2/3) the logo and tagline, the "Õpi" links, the organisation links and "Kohtume" (contact), tighter; right (≈ 1/3) the newsletter as a smaller lilac card: title ≈ 28px, text, e-mail, "Liitu" and the consent under each other;
  - the bottom row (copyright, legal links) as today;
  - below 900 px it stacks (newsletter card first, as today); account pages still hide the newsletter.
- **Dashboard** (`/konto`):
  - `GET /api/konto` adds to each e-course card with active access: `progress: { done, total, next: { lessonId, title, moduleTitle } | null }` (visible lessons only; `null` progress when the course has no visible lessons).
  - At the top of "Minu koolitused" a dark **"Pooleli"** card for the e-course with the latest progress activity that is not finished: tag "Pooleli", course title, "{module} · {lesson}", a progress bar, "{done} / {total} õppetundi tehtud" and the one primary button **"Jätka"** (to the next lesson). If the student has an e-course with lessons but no progress yet, the card says "Alusta" instead and shows the first lesson. Finished or lesson-less courses get no card.
  - Each e-course card gets a thin progress bar and "{done} / {total}"; a finished one says "Läbitud ✓".
  - Same static-shell rules as 2a/3a (data only from `/api/konto`, `private, no-store`). The existing components and tokens; the dark card reuses the e-course page's progress bar.

## 5. Newsletter popup and welcome code

**Data:** the singleton `campaign` row becomes one row per popup kind: new column `kind` (`campaign` | `newsletter`, unique); the migration adds a `newsletter` row (inactive) with default ET/RU texts. A partial unique index allows **at most one active** row (`where active`).

**Admin** ("Kampaania" page, renamed **"Hüpikaken"**):
- A choice at the top, **"Lehel näidatakse"**: Kampaania / Uudiskiri / Väljas. Saving sets the `active` flags in one transaction.
- Two editors with their live ET/RU previews, as today's: Kampaania (unchanged fields) and Uudiskiri (kicker, title, text, picture).

**Popup** (home page, same 6 s delay and once-per-session rule):
- The newsletter popup shows its texts and a form: e-mail, the consent checkbox (the footer's wording), "Liitu". It posts to the existing `subscribe` action (honeypot, rate limits, 3 confirmation mails per address a day). Success: "Saatsime sulle kinnituslingi. Ava see oma postkastis." inside the popup.
- After a successful signup the browser remembers it (`localStorage` key `mslab-nl`, wrapped in try/catch) and never shows the newsletter popup again.

**Welcome code:**
- New setting in Seaded, **"Tervituskood"** (`newsletter.welcomeCode`, empty by default; A–Z, 0–9 and `-`, max 30). The footer text keeps its discount label.
- On confirmation (`confirmSubscriber`, the first time only), if a code is set: one **"Tere tulemast MS LABi!"** mail with the code and how to use it ("Lisa kood registreerimisel lahtrisse „Sõnum“." / RU; Maria applies it on the invoice — there are no online payments yet), and the confirmed notice on `/?uudiskiri=kinnitatud` shows the code too. A repeat confirmation sends nothing.
- Footer and popup signups get the same code. Clients who switch the newsletter on in Minu andmed are confirmed at once and get the same mail (once).

## 6. Consent on the registration forms

- Group registration, individual-course request, e-course purchase wish and the waitlist get an unticked checkbox **"Soovin MS LABi uudiseid ja pakkumisi"** (RU draft «Хочу получать новости и предложения MS LAB»). The contact form does not.
- Ticked: after the form itself succeeds, the same subscribe path runs (unconfirmed row + confirmation mail; nothing if the address is already confirmed). A failure there never fails the registration.
- Admin Õpilased drawer: **"Uudiskiri: jah / ootab kinnitust / ei"**.

## 7. Optional password

**Data:** `clients.password_hash` (text, null) and `clients.password_changed_at` (timestamptz, null).

**Hash:** `node:crypto` scrypt, N = 2^15, r = 8, p = 1, 64-byte key, 16-byte random salt, stored as `scrypt$15$8$1$<salt>$<key>` (base64url); compared with `timingSafeEqual`. No new dependency.

**Minu andmed → "Parool":**
- None set: "Saad soovi korral määrata parooli ja siseneda edaspidi e-posti ja parooliga. Kood töötab alati edasi." and **"Määra parool"** (password twice, min 10 and max 200 characters, not the e-mail address).
- Set: "Parool on määratud (muudetud {date})." with **"Muuda parooli"** and **"Eemalda parool"** (inline confirm, as "Kustuta konto").
- Each set, change or removal sends a short mail "Sinu MS LABi konto parool on muudetud." (ET/RU) with a line to write to Maria if it wasn't her. The current session continues.

**Login** (`/konto/sisene`, static shell, state in the fragment `#parool`):
- Unchanged: e-mail → code/link. Below it a quiet link **"Sisene parooliga"** switches to e-mail + password + **"Logi sisse"**, with **"Saada mulle hoopis kood"** back.
- `POST /api/konto/parool-login {email, password}` → `startSession` (the one-device rule as for the code). Same-origin POST, `private, no-store`.
- Any failure answers one message: **"E-post või parool ei sobi."** — unknown address, no password set, wrong password alike; an unknown address or one without a password still runs scrypt against a fixed dummy hash (equal timing).
- Lock: 5 failures per address or 20 per IP in 15 minutes (the existing Postgres rate-limit table) → "Liiga palju katseid. Proovi 15 minuti pärast uuesti või sisene koodiga." Failures count whether or not the address exists.
- Forgotten password: the normal code login, then a new password in Minu andmed.

**API** (all behind `requireClient` + `clientResponse` except the login): `POST /api/konto/parool {password}` (set or change), `DELETE /api/konto/parool`; `GET /api/konto/andmed` reports `passwordSetAt`. The account-guards test lists the new handlers.

## 8. Data and migrations

One additive migration **`0005_phase2c.sql`**: `lesson_progress.clock_at`; `campaign.kind` + unique index + the `newsletter` row + the partial unique index on `active`; `clients.password_hash`, `clients.password_changed_at`. The setting `newsletter.welcomeCode` lives in the settings store (seed default empty, no migration).

The drop of `courses.modules` (planned as 0005 in the 3a plan) becomes **0006** and stays "code first, then the migration"; the 3a plan, `docs/launch-checklist.md` §8 and `0003_lessons.sql`'s comment are updated to say 0006.

Deploy order as before: the additive migration on Railway first (old code unaffected), then the deploy.

## 9. Wording (ET; RU drafted by the implementer and listed for the native-speaker check)

"Edasi saab kerida kuni kohani, kuhu oled jõudnud." · "Pooleli" · "Jätka" / "Alusta" · "{done} / {total} õppetundi tehtud" · "Läbitud ✓" · "Hüpikaken" · "Lehel näidatakse" · "Kampaania" / "Uudiskiri" / "Väljas" · "Saatsime sulle kinnituslingi. Ava see oma postkastis." · "Tervituskood" · "Tere tulemast MS LABi!" · "Soovin MS LABi uudiseid ja pakkumisi" · "Uudiskiri: jah / ootab kinnitust / ei" · "Parool" · "Määra parool" · "Muuda parooli" · "Eemalda parool" · "Sisene parooliga" · "Saada mulle hoopis kood" · "E-post või parool ei sobi." · "Liiga palju katseid. Proovi 15 minuti pärast uuesti või sisene koodiga." · "Sinu MS LABi konto parool on muudetud."

## 10. Testing

- Unit: the progress cap (elapsed, clamp, no `clock_at`, 2× factor), the seek rule (3 s tolerance, ended near the end only), scrypt format and verify (known vector, wrong password, malformed hash), welcome-code validation, popup choice (one active).
- DB (PGlite): migration 0005 (the newsletter row, one-active index), progress clamping, first-time-only welcome mail, consent from a registration, password set/change/remove, login failures and the lock, dummy-hash path.
- E2E (dev and `E2E_PROD_BUILD=1`): seek lock with the fake player (it records `setCurrentTime`), dashboard "Pooleli" card and bars, popup switch in the admin and the newsletter popup on the home page, password set → logout → "Sisene parooliga" → in, wrong password message, lock; the look changes on 390/834/1440/2560 px with no horizontal overflow; visual snapshots updated.
- Live after deploy: `setCurrentTime` obeyed by Bunny's player, its top speed, one real welcome mail.
