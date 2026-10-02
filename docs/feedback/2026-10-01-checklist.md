# Maria's requirements — build checklist

Every item traces to a source: `Cxx` = comment in `2026-10-01-maria-comments-raw.md`, `O` = her 01.10
overview message, `E` = earlier chat (22.09 / 26.09, `ChatExport_2026-09-29`). Phase = when it is built.
Each phase-1 item is ticked only after it is verified on the deployed site (screenshot or test).
"Done" (02.10.2026): verified on the deployed site by the independent check (`.superpowers/sdd/2026-10-01-main-site-phase1/task-16b-verification.md`,
"16B" below) and/or an automated test; the gaps it found are closed in Task 16A round 2 (`task-16-report.md`, "Fix round 2").
"—" = a later phase.

## Global look

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| G1 | Base everything on **B** (Õppeteekond) — "liiguks edasi selle stiili suunas" | C06 | 1 | ✅ B layout section by section (16B G1) |
| G2 | **A's fonts**: Jost (headings, numbers, prices) + Manrope (UI, body) | C06 | 1 | ✅ Jost headings/prices, Manrope UI, measured live (16B G2); mono step numbers flagged for Maria (N7) |
| G3 | Header exactly as B (logo placement and size unchanged; turns white and sticky on scroll) | C01 | 1 | ✅ logo box identical to B, sticky + white on scroll (16B G3) |
| G4 | Header menu items, "Logi sisse" button and language switch in the new font (Manrope) | C01 | 1 | ✅ Manrope 15/500 in the header; e2e `shell.spec.ts` |
| G5 | Header colour follows the hero slide (light/dark), set per slide in admin | E 26.09 | 1 | ✅ tone per slide; e2e `home.spec.ts` (header tone), `admin-site.spec.ts` (slide 1 dark) |
| G6 | Palette: #222222 ink, Orchid Tint family (#9E8993 … #EBE8E9), white; lilac newsletter tone kept | E 22.09, C10 | 1 | ✅ ink #222, Orchid tints, lilac newsletter (16B G6) |
| G7 | Clean, Apple-like, no "piu-pau" | E 22.09 | 1 | ✅ calm layout at 390–2560 (16B G7) |
| G8 | ET + RU | spec | 1 | ✅ all routes in RU; sample content translated (round 2 item 1a, drafts for a native check), badge labels and trainer name in RU; e2e `home.spec.ts` (RU home, trainer card) |

## Home (`/`)

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| H1 | B hero kept as a whole; first slide image (B's flower) kept | C02 | 1 | ✅ flower slide 1 (16B H1) |
| H2 | Hero slide control = **A's** (`01 / 05` + segment bar + prev/next) instead of B's | C03 | 1 | ✅ A's counter + segments + arrows, pause toggle; e2e `home.spec.ts` hero behaviour |
| H3 | "Vaata koolituskalendrit": oval like the primary button, **empty inside, thin black border**, **arrow pointing right** like the primary | C04 | 1 | ✅ outline pill with → arrow; e2e `home.spec.ts` (first test) |
| H4 | Keep the small vertical "BROW & LASH ACADEMY" detail | C05 | 1 | ✅ vertical text at all widths (16B H4) |
| H5 | Full-bleed, edge-to-edge hero, 4–5 slides | E 22.09 | 1 | ✅ 5 full-bleed slides; e2e `home.spec.ts` |
| H6 | Primary hero CTA wording "Leia oma koolitus" (B) | C02 (B hero kept; C40 is the popup button, M4) | 1 | ✅ hero slide 1 button; e2e `admin-site.spec.ts` (slide 1 link) |
| H7 | D "Kuidas soovid õppida?" block on home (tabs + steps) | C24 | 1 | ✅ tabs + steps; e2e `home.spec.ts` (formats tabs; RU tabs fit at 360/390) |
| H8 | D statement line kept, **smaller** text | C25 | 1 | ✅ Jost 36px (D 46px) (16B H8) |
| H9 | D "Sinu koolitaja" block on home | C26, C27 | 1 | ✅ D's card with D's line and stat labels (C26, round 2 item 5), editable under Avaleht; e2e `home.spec.ts` (trainer card) |
| H10 | B practice block on home ("Individuaalpraktika…") kept, with: **approximate duration on each card (e.g. "8 ak"), admin-editable** | C07 | 1 | ✅ "≈ 4 ak" / "≈ 8 ak", admin field; e2e `admin-site.spec.ts` (MAXI duration) |
| H11 | Practice block: make **"Praktika" stand out first**, slogans/descriptions secondary | C08 | 1 | ✅ H2 "Praktika" first (16B H11) |
| H12 | Practice block price ("100,00 €"): **different font (Jost) and a bit smaller** | C09 | 1 | ✅ Jost 28px (B 34px) (16B H12) |
| H13 | B newsletter ("MS LABi kirjad — Hea järgmine samm. Otse sinu postkasti.") with lilac tone, **moved into the footer**; sentence kept | C10, C11 | 1 | ✅ lilac card in the footer, sentence kept (16B H13) |
| H14 | D FAQ on home | C30 | 1 | ✅ 6 questions, accordion; e2e `home.spec.ts` |
| H15 | D contact block ("Ei tea, milline koolitus sobib?") on home, working form | C31 | 1 | ✅ working form; e2e `home.spec.ts` (contact form) |
| H16 | Blog carousel, clickable cards → full post | E 22.09 | 1 | ✅ carousel → posts, swipe; e2e `home.spec.ts`, `swipe.spec.ts` |
| H17 | Flower as signature visual | E 22.09 | 1 | ✅ hero flower, practice icon (16B H17) |

## Learning formats and catalogue (`/koolitused`)

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| K1 | Hybrid is **not** a choice on any course; only an explanation (combine e-learning and contact courses) | O | 1 | ✅ chips only Kõik / E-õpe / Kontaktõpe; Maria's hybrid text (round 2 item 3); e2e `catalogue.spec.ts`, `home.spec.ts` |
| K2 | Each course is **either** e-learning **or** contact; its page is built for that type | O | 1 | ✅ type-specific pages; e2e `course.spec.ts` |
| K3 | Format chips and level chips on **separate rows** (B) | C17 | 1 | ✅ separate rows; e2e `catalogue.spec.ts` |
| K4 | Level categorisation Baaskoolitused / Täiendkoolitused | E 26.09 | 1 | ✅ level chips, `?tase=`; e2e `catalogue.spec.ts` |
| K5 | D explainer colour/content kept; **steps centred symmetrically in the box**, dotted line **through the circle centres** | C12 | 1 | ✅ symmetric circles, line through centres; e2e `home.spec.ts` (step geometry) |
| K6 | Explainer description text **smaller** | C13, C14 | 1 | ✅ 16px (D 21px) (16B K6) |
| K7 | D "Õppevormid" three-card overview kept | C15 | 1 | ✅ three cards in "Kõik"; e2e `catalogue.spec.ts` |
| K8 | Hybrid explainer: **no numbers/steps**, description only ("ühendab kaks õppevormi…") | C16 | 1 | ✅ hybrid: text only; e2e `home.spec.ts`, `catalogue.spec.ts` |
| K9 | Page heading "Leia oma koolitus" kept but **smaller** | C18 | 1 | ✅ 52px (D 80px) (16B K9) |
| K10 | Intro sentence kept but **smaller** | C19 | 1 | ✅ 17px (D 21px) (16B K10) |
| K11 | E-learning 01–05 steps (Maria's wording); contact explained as on-site, individual or group | E 26.09 | 1 | ✅ Maria's 01–05 steps; e2e `home.spec.ts` (formats tabs) |
| K12 | Course badges, set by Maria (label + colour) | E 26.09, C36 | 1 | ✅ badges with ET + RU labels (round 2 item 1c); e2e `admin-edit.spec.ts` (badge), `catalogue.spec.ts` |
| K13 | Search | E 26.09 | 1 | ✅ diacritics-insensitive search; e2e `catalogue.spec.ts` |

## Course page (`/koolitused/[slug]`)

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| P1 | B course page is the base ("jätame selle, ehitame peale") | C23 | 1 | ✅ B base (16B P1) |
| P2 | Large main image + small images below (A), small images in a **carousel**, **clickable** (lightbox) | C32 | 1 | ✅ thumbnail carousel + lightbox, swipe; e2e `course.spec.ts`, `swipe.spec.ts` |
| P3 | Right side summary like browmaniac: modules count, video count, trainer, next-course discount (e.g. "−10% järgmiselt koolituselt") | O | 1 | ✅ modules, Õppevideod, access, trainer link, −10% (round 2 item 10); e2e `course.spec.ts` (summary column) |
| P4 | "Jaga koolitust" button | C45, O | 1 | ✅ share / copy + toast; e2e `course.spec.ts` |
| P5 | "Sulle võiksid huvi pakkuda" recommendations at the very bottom | C46, O | 1 | ✅ last section, no lone card at 834 (round 2 item 11); e2e `course.spec.ts` |
| P6 | ♡ favourite / "Lisa lemmikutesse" (browser now; student dashboard folder in phase 2) | C33, C44, O | 1 → 2 | ✅ browser favourite (phase-1 part); e2e `course.spec.ts` |
| P7 | Trainer info with active link to the trainer page | O | 1 | ✅ summary link + trainer card → /koolitaja; e2e `course.spec.ts` |
| P8 | **E-learning**: description, video count, access period (e.g. 6 months), outcomes, language, payment options, module list visible but not openable, "includes knowledge test + practical-work assessment", certificate after completion | O | 1 | ✅ e-learning content set, locked modules; e2e `course.spec.ts` |
| P9 | **E-learning payments**: (1) Maksa kohe — 100% bank link; (2) Vormista järelmaks — shown, enabled in phase 4 | O | 1 (UI) → 2/4 | ✅ Maksa kohe + disabled Vormista järelmaks (UI); e2e `course.spec.ts` |
| P10 | **Contact**: description, outcomes, language, programme, payment options, trainer link, "Koolitus sisaldab" list (theory; practice e.g. on two models; materials to keep; trainer guidance and personal support; knowledge test; practical assessment; all tools provided; certificate on success) | O | 1 | ✅ Maria's 8 includes; e2e `course.spec.ts` |
| P11 | Contact: "may bring own models; centre helps if needed" + form checkbox "Soovin koolituskeskuse abi modellide leidmisel" | O | 1 | ✅ note + checkbox; e2e `course.spec.ts` (form) |
| P12 | Contact participation: **Grupikoolitus** → calendar of available dates, pick one; **Individuaalkoolitus** → request form (preferred period/date) → Maria | O | 1 | ✅ group dates / individual request; e2e `course.spec.ts` |
| P13 | Group and individual have **different prices** | O | 1 | ✅ 350 € vs 450 €; e2e `course.spec.ts` |
| P14 | Contact payment: 100% now / 50% at registration + 50% on the day / instalment later | O | 1 (UI) → 2 | ✅ 100% / 50%+50% / disabled "Järelmaks — tulekul" (round 2 item 4); e2e `course.spec.ts` (form), unit `forms.test.ts` |
| P15 | **Registration confirmed only after ≥50% prepayment**; the form alone does not confirm | O, C53 | 1 (status) → 2 | ✅ status awaiting prepayment + info line; e2e `course.spec.ts`, `admin-inbox.spec.ts` |
| P16 | Checkbox "Loo mulle kohe konto MS LAB keskkonda" | O | 1 (stored) → 2 | ✅ checkbox stored and mailed; `server/forms.ts`, `server/messages.ts` |
| P17 | Moderated student reviews under each course | C47 | 4 | — |

## Calendar (`/koolituskalender`)

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| L1 | A calendar kept overall | C20 | 1 | ✅ A rows and city chips (16B L1) |
| L2 | **Course name first and dominant** (size of A's city), city after it | C21 | 1 | ✅ course name first, Jost 26px; e2e `pages.spec.ts` (calendar) |
| L3 | Then city, format, seats etc. secondary | C21 | 1 | ✅ city, format, seats after the name; e2e `pages.spec.ts` |
| L4 | **Language tag** on each row | C21 | 1 | ✅ ET / RU tags; e2e `pages.spec.ts` |
| L5 | City visible on every row; city filter | E 26.09 | 1 | ✅ city filter `?linn=`; e2e `pages.spec.ts` |

## Practice (`/praktika`)

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| R1 | Intro text, MINI and MAXI packages, "Registreeru" | E 22.09 | 1 | ✅ intro, MINI / MAXI, Registreeru; e2e `pages.spec.ts` (practice) |
| R2 | Dark panel text: "Praktika toimub koolitaja juhendamisel…" + praktikaprotokoll explanation | E 26.09 | 1 | ✅ dark panel + protocol; e2e `pages.spec.ts` |
| R3 | Package lists editable by Maria | E 26.09 | 1 | ✅ list editor; e2e `admin-site.spec.ts` |
| R4 | **Practice takes place only in Pärnu** — stated clearly | C22 | 1 | ✅ "Ainult Pärnus" kicker + pill; e2e `pages.spec.ts` |
| R5 | Duration per package, "Praktika" emphasised, price smaller in Jost (same as H10–H12) | C07–C09 | 1 | ✅ durations, Jost prices; e2e `pages.spec.ts` |

## Trainer, blog

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| T1 | D trainer page kept as base | C29 | 1 | ✅ D base (16B T1) |
| T2 | Small works gallery ("koolitaja tööd") under the portrait, 2–3 per row, carousel, open full size | C29 | 1 | ✅ under the portrait, 3 per row (2 on phones, round 2 item 9), carousel + lightbox; e2e `pages.spec.ts`, `swipe.spec.ts` |
| T3 | "Koolituskeskuse lugu" section (editable) | C29 | 1 | ✅ editable section; e2e `admin-site.spec.ts` |
| T4 | "Koolitaja teekond" section (editable) | C29 | 1 | ✅ editable section; e2e `admin-site.spec.ts` |
| B1 | D blog section/page kept for now | C28 | 1 | ✅ D blog kept (16B B1) |

## Campaign popup

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| M1 | D popup design and behaviour kept | C37 | 1 | ✅ 6 s, once per session, home only, bottom sheet on phones; e2e `campaign.spec.ts` |
| M2 | D admin editor kept | C38, C42 | 1 | ✅ D editor; e2e `admin-site.spec.ts` (campaign) |
| M3 | Remove "Mitte praegu" | C39 | 1 | ✅ no "Mitte praegu"; e2e `campaign.spec.ts` |
| M4 | CTA wording "Leia enda koolitus" | C40, C41 | 1 | ✅ "Leia enda koolitus" on B's dark pill with → (round 2 item 2); e2e `campaign.spec.ts` |
| M5 | **Image upload** in the campaign editor | C43 | 1 | ✅ image upload; e2e `admin-site.spec.ts` (campaign) |

## Student area

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| S1 | B student dashboard kept | C34 | 2 | — |
| S2 | Dashboard menu less clumsy | C35 | 2 | — |
| S3 | Favourites folder on the dashboard | C33, C44 | 2 | — |
| S4 | Several courses shown separately in one view | E 26.09 | 2 | — |
| S5 | Before starting an e-course: notice that access is personal and must not be shared + "Olen tutvunud ja nõustun tingimustega" | C54 | 2 | — |
| S6 | End-of-course feedback form: multiple choice + free text | C48 | 4 | — |
| S7 | Account auto-created on e-course purchase; login then learn | E 26.09 | 2 | — |

## Admin

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| A1 | B admin panel incl. left sidebar is the base | C51 | 1 | ✅ B sidebar; e2e `admin-inbox.spec.ts` |
| A2 | D badge editor kept | C36 | 1 | ✅ D badge editor, RU label too; e2e `admin-edit.spec.ts` |
| A3 | Waitlist ("Liitu ootenimekirjaga") kept | C49 | 1 | ✅ "Liitu ootenimekirjaga" on the row and the form (round 2 item 12); e2e `pages.spec.ts`, `admin-inbox.spec.ts` |
| A4 | Filter **Kõik / E-õpe / Kontaktõpe** for students/registrations | C53 | 1 (registrations) → 2 (students) | ✅ registrations filter `?vorm=e|k` (phase-1 part); e2e `admin-inbox.spec.ts` |
| A5 | Practical-work assessment: Maria defines N work steps per e-course; student uploads 1–3 photos per step; appears under "Hindamised"; comment per photo; approval → certificate; no certificate without approval | C50 | 3 | — |
| A6 | Contracts between centre and student, ideally digitally signed | C52 | 4 | — |
| A7 | Contact-course invoices 100% / 50%, PDF download, send to student dashboard and e-mail | C53 | 4 | — |
| A8 | Practice package lists, durations editable | C07, E 26.09 | 1 | ✅ practice lists and durations; e2e `admin-site.spec.ts` |
| A9 | Hero slides with light/dark setting editable | E 26.09 | 1 | ✅ slide tone light/dark; e2e `admin-site.spec.ts` |

## Certificate

| ID | Requirement | Source | Phase | Done |
|---|---|---|---|---|
| X1 | Generator: student name in the certificate's script font + date + certificate number | Dim 29.09 | 3 | — |
