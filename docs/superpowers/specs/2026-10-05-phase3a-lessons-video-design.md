# MS LAB Phase 3a — Lessons, video and progress (design)

Status: approved by Dim on 05.10.2026 (brainstorming). Builds on phase 2a client accounts (`2026-10-02-phase2a-client-accounts-design.md`), which is live.

## 1. Scope

Phase 3 (learning) is split into four specs, built in order: **3a lessons + video + progress** (this spec), 3b knowledge test, 3c practical-work review (1–3 photos per step, Maria approves), 3d certificate PDF.

3a turns the e-course page ("Sisu lisandub peagi" today) into a real course: modules with lessons, a video per lesson, short text and files, lessons that unlock in order, and progress.

Out of scope for 3a: test, practical work, certificate, free preview lesson, captions/subtitles, bulk video import (the videos are being recorded now; Maria uploads them one by one).

## 2. Decisions (Dim, 05.10.2026)

| Topic | Decision |
|---|---|
| Video host | **Bunny Stream** (one library on Dim's account; Maria's account later). ~€5–15/month for ~500 h. |
| Lesson content | One video + optional short text (ET/RU) + optional downloadable files. |
| Adding a video | Uploaded **in our admin**, straight from Maria's browser to Bunny (resumable). |
| Order | Lessons unlock **in order**: lesson n+1 opens when lesson n is done. |
| Done rule | **Automatic at ~90 % watched**; text-only lessons have "Märgi tehtuks". Admins can open the next lesson for a stuck student. |
| Protection | **Signed playback links + the student's e-mail as a faint moving watermark**, no download, mslab domains only, plus the existing one-device account. |
| Existing videos | None yet (being recorded): no import. |

## 3. Data

- `course_modules` — id, course_id (FK, cascade), position, title (I18n). Replaces the `courses.modules` jsonb list; a migration copies every existing title (order kept). The public course page, the e-course page and the admin read modules from this table. `courses.modules` is kept by this migration (the live code still reads it until the deploy) and dropped by a later migration once the new code is live.
- `lessons` — id, module_id (FK, cascade), position, title (I18n), body (I18n, optional short text), hidden (bool, default false), video_id (Bunny guid, nullable), video_status (`none` | `uploading` | `processing` | `ready` | `failed`), duration_sec (nullable), created_at.
- `lesson_files` — id, lesson_id (FK, cascade), position, name (as shown), r2_key (private prefix `lessons/…`), size, content_type.
- `lesson_progress` — client_id (FK clients, cascade), lesson_id (FK, cascade), watched_sec (monotonic), done_at (nullable), unlocked_by (admin e-mail, nullable — set when an admin opened the next lesson), updated_at; PK (client_id, lesson_id).
- `courses.video_count` stays as the public figure Maria types (not derived), unchanged.

Lock rule (pure, in `src/domain/lessons.ts`): visible lessons in module order then lesson order; lesson k is unlocked when k = first, or the previous visible lesson is done, or an admin unlocked lesson k for that client. Hidden lessons are skipped (neither counted nor blocking). Progress counts = done visible lessons / visible lessons.

## 4. Admin

Koolitused → an e-course → new part **"Moodulid ja õppetunnid"** (replaces the module-title list editor for e-courses; contact courses keep their module titles in the same table, edited the same way, without lessons).

- Modules: add, rename (ET/RU), reorder ↑↓, delete (only when it has no lessons).
- Lessons: add, title ET/RU, short text ET/RU, files (upload to R2 via the existing upload route pattern; size limit as images; PDF/images/docx), reorder ↑↓ within and across modules, **"Peida"** (hide) instead of delete once any student has progress on it; delete only without progress (deletes its Bunny video and its R2 files).
- Video field: choose a file → upload straight to Bunny with tus (resumable, progress bar) → "Töötlemisel…" → "Valmis · 12:34". "Asenda video" replaces it (old Bunny video deleted after the new one is ready). States shown: Üleslaadimine katkes (with "Proovi uuesti"), Töötlemine ebaõnnestus (with "Lae uuesti üles").
- Upload flow: server action `createLessonVideo(lessonId)` → Bunny API creates the video (title = course · lesson) → returns `{ videoId, libraryId, expires, signature }` where signature = sha256(libraryId + apiKey + expires + videoId) (Bunny's presigned tus upload). The API key never reaches the browser. The lesson row is set `uploading`.
- Status: Bunny webhook `POST /api/bunny/webhook` only triggers a status fetch from the Bunny API for that video id (payload not trusted); while the editor is open it also polls a server action every 5 s. Ready → `ready` + duration; failed → `failed`.
- Student panel (Õpilased drawer): per e-course "5/24 tehtud"; button **"Ava järgmine õppetund"** (sets `unlocked_by` on the next locked lesson) with the existing inline confirm pattern. "Vaata tema vaadet" shows the course with read-only progress.

All admin actions are `adminAction` exports (static guard test extended); admin strings ET only.

## 5. Student

Static shells as in 2a (no server reads of cookies/headers/searchParams; data via `AccountLoader`; links carry state in the fragment; the middleware's 303 rule covers the new routes).

**E-course page** `/[locale]/konto/kursus/[slug]`: terms notice first (unchanged). Then title, "Ligipääs kuni …", progress "5 / 24 õppetundi tehtud" with a thin bar, one primary button **"Jätka"** ("Alusta" before the first) → next unfinished unlocked lesson. Module list: ✓ done, ▶ current, 🔒 locked with "Avaneb, kui eelmine õppetund on tehtud." On phones modules collapse; the current one starts open.

**Lesson page** `/[locale]/konto/kursus/[slug]/[lesson]` (new static shell, `generateStaticParams → []`; lesson param = lesson id): module + lesson title, video, short text, files ("Lae alla"), one button **"Järgmine õppetund"** (enabled when this lesson is done) and a quiet "Tagasi koolitusele". Locked lesson → locked notice + "Jätka". Video not ready → "Video lisandub peagi" (lesson can't be completed yet).

**Player:** Bunny's iframe embed (adaptive quality, speed, phone friendly) with a signed URL valid ~4 h (`token` = sha256(tokenKey + videoId + expires)), `allow` without fullscreen; our own fullscreen button enlarges a wrapper holding the iframe and the **watermark** (student's e-mail, ~30 % opacity, moves between corners every ~60 s, `pointer-events: none`). Accepted limit: iPhone's native fullscreen shows no watermark. Progress via the embed's Player.js events: resume at the saved point; `timeupdate` → POST progress every ~15 s and on pause/end.

**Done:** at watched ≥ 90 % of `duration_sec` the server sets `done_at` → the page shows "Õppetund tehtud ✓" and enables "Järgmine õppetund". Text-only lesson: "Märgi tehtuks".

## 6. API (extends `/api/konto`, same conventions: `requireClient` + `clientResponse`, same-origin POSTs, `private, no-store`)

- `GET /api/konto/kursus/:slug` — existing view + modules, visible lessons with state (`done` | `current` | `locked`), counts, next lesson id. (Terms notice logic unchanged.)
- `GET /api/konto/kursus/:slug/:lesson` — lesson data; for an unlocked lesson with a ready video: `{ embedUrl, expires, resumeAt }`; locked → 403 `{ error: "locked" }`; no access → 404 (as today).
- `POST /api/konto/kursus/:slug/:lesson/progress` `{ watchedSec }` (number, 0…duration+5) — monotonic max; sets `done_at` at ≥ 90 %; answers `{ done, next }`. Rate-limited per session (e.g. 12/min) to cap writes.
- `POST /api/konto/kursus/:slug/:lesson/tehtud` — text-only lessons only.
- `GET /api/konto/kursus/:slug/:lesson/fail/:fileId` — checks access + unlock, 302 to a short-lived presigned R2 GET (aws4fetch, as `/media` signs), `private, no-store`.

All checks: session (one device) → active access to the course (not expired/revoked; unpublished courses still work, as in 2a) → lock order.

## 7. Errors

Upload interrupted → resumable; closing the page leaves "Üleslaadimine katkes" + retry; the daily cron also deletes Bunny videos stuck in `uploading` > 24 h (and their rows go back to `none`). Bunny unavailable → lesson text and files still load; the video area says "Video ei lae. Proovi hiljem uuesti.". Webhook spoofing → harmless (status is re-read from Bunny). Progress faking → affects only the student's own unlocks (guidance, not security). A lesson with progress is hidden, never deleted, so counts stay honest.

## 8. Configuration and costs

New Vercel env vars (production): `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY`, `BUNNY_CDN_HOST`; optional `BUNNY_WEBHOOK_SECRET` (a query secret on the webhook URL, checked before the status fetch). `serverEnv()` treats them as optional: without them the admin video field says "Video seadistamata" and students see "Video lisandub peagi". Bunny library settings: token authentication on, allowed referrers = mslab domains, MP4 fallback/download off. No change to Vercel/Railway plans; Bunny is pay-as-you-go (~€5–15/month at ~500 h).

## 9. Testing

- Unit: lock rule (order, hidden lessons, admin unlock), 90 % rule, tus signature and embed token signing (known vectors), reorder.
- DB (PGlite): modules migration (jsonb → rows, order kept), lesson CRUD, hide vs delete, monotonic progress, done at 90 %, unlock-next, access checks (expired/revoked → 404, locked → 403).
- E2E (dev, fake Bunny server like the R2 tests): Maria creates a module and lessons with a file; a student opens the course → lesson 1 open, lesson 2 locked; progress POSTs mark lesson 1 done → lesson 2 opens; file download only with access; cache spec covers the new lesson shell.
- No real Bunny calls in tests. One manual live upload and playback check after deploy.

## 10. Before deploy

Dim creates the Bunny Stream library and sets the env vars (steps written in `docs/deploy.md` during implementation). Migration order: (1) the additive migration (new tables + copy of the module titles) runs on Railway before the deploy; (2) deploy; (3) a later migration drops `courses.modules`. Module titles edited in the admin between (1) and (2) would not be copied — the window is minutes; re-run the copy for that course if it happens.
