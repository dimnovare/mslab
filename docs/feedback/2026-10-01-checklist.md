# Maria's requirements — build checklist

Every item traces to a source: `Cxx` = comment in `2026-10-01-maria-comments-raw.md`, `O` = her 01.10
overview message, `E` = earlier chat (22.09 / 26.09, `ChatExport_2026-09-29`). Phase = when it is built.
Each phase-1 item is ticked only after it is verified on the deployed site (screenshot or test).

## Global look

| ID | Requirement | Source | Phase |
|---|---|---|---|
| G1 | Base everything on **B** (Õppeteekond) — "liiguks edasi selle stiili suunas" | C06 | 1 |
| G2 | **A's fonts**: Jost (headings, numbers, prices) + Manrope (UI, body) | C06 | 1 |
| G3 | Header exactly as B (logo placement and size unchanged; turns white and sticky on scroll) | C01 | 1 |
| G4 | Header menu items, "Logi sisse" button and language switch in the new font (Manrope) | C01 | 1 |
| G5 | Header colour follows the hero slide (light/dark), set per slide in admin | E 26.09 | 1 |
| G6 | Palette: #222222 ink, Orchid Tint family (#9E8993 … #EBE8E9), white; lilac newsletter tone kept | E 22.09, C10 | 1 |
| G7 | Clean, Apple-like, no "piu-pau" | E 22.09 | 1 |
| G8 | ET + RU | spec | 1 |

## Home (`/`)

| ID | Requirement | Source | Phase |
|---|---|---|---|
| H1 | B hero kept as a whole; first slide image (B's flower) kept | C02 | 1 |
| H2 | Hero slide control = **A's** (`01 / 05` + segment bar + prev/next) instead of B's | C03 | 1 |
| H3 | "Vaata koolituskalendrit": oval like the primary button, **empty inside, thin black border**, **arrow pointing right** like the primary | C04 | 1 |
| H4 | Keep the small vertical "BROW & LASH ACADEMY" detail | C05 | 1 |
| H5 | Full-bleed, edge-to-edge hero, 4–5 slides | E 22.09 | 1 |
| H6 | Primary hero CTA wording "Leia oma koolitus" (B) | C40 | 1 |
| H7 | D "Kuidas soovid õppida?" block on home (tabs + steps) | C24 | 1 |
| H8 | D statement line kept, **smaller** text | C25 | 1 |
| H9 | D "Sinu koolitaja" block on home | C26, C27 | 1 |
| H10 | B practice block on home ("Individuaalpraktika…") kept, with: **approximate duration on each card (e.g. "8 ak"), admin-editable** | C07 | 1 |
| H11 | Practice block: make **"Praktika" stand out first**, slogans/descriptions secondary | C08 | 1 |
| H12 | Practice block price ("100,00 €"): **different font (Jost) and a bit smaller** | C09 | 1 |
| H13 | B newsletter ("MS LABi kirjad — Hea järgmine samm. Otse sinu postkasti.") with lilac tone, **moved into the footer**; sentence kept | C10, C11 | 1 |
| H14 | D FAQ on home | C30 | 1 |
| H15 | D contact block ("Ei tea, milline koolitus sobib?") on home, working form | C31 | 1 |
| H16 | Blog carousel, clickable cards → full post | E 22.09 | 1 |
| H17 | Flower as signature visual | E 22.09 | 1 |

## Learning formats and catalogue (`/koolitused`)

| ID | Requirement | Source | Phase |
|---|---|---|---|
| K1 | Hybrid is **not** a choice on any course; only an explanation (combine e-learning and contact courses) | O | 1 |
| K2 | Each course is **either** e-learning **or** contact; its page is built for that type | O | 1 |
| K3 | Format chips and level chips on **separate rows** (B) | C17 | 1 |
| K4 | Level categorisation Baaskoolitused / Täiendkoolitused | E 26.09 | 1 |
| K5 | D explainer colour/content kept; **steps centred symmetrically in the box**, dotted line **through the circle centres** | C12 | 1 |
| K6 | Explainer description text **smaller** | C13, C14 | 1 |
| K7 | D "Õppevormid" three-card overview kept | C15 | 1 |
| K8 | Hybrid explainer: **no numbers/steps**, description only ("ühendab kaks õppevormi…") | C16 | 1 |
| K9 | Page heading "Leia oma koolitus" kept but **smaller** | C18 | 1 |
| K10 | Intro sentence kept but **smaller** | C19 | 1 |
| K11 | E-learning 01–05 steps (Maria's wording); contact explained as on-site, individual or group | E 26.09 | 1 |
| K12 | Course badges, set by Maria (label + colour) | E 26.09, C36 | 1 |
| K13 | Search | E 26.09 | 1 |

## Course page (`/koolitused/[slug]`)

| ID | Requirement | Source | Phase |
|---|---|---|---|
| P1 | B course page is the base ("jätame selle, ehitame peale") | C23 | 1 |
| P2 | Large main image + small images below (A), small images in a **carousel**, **clickable** (lightbox) | C32 | 1 |
| P3 | Right side summary like browmaniac: modules count, video count, trainer, next-course discount (e.g. "−10% järgmiselt koolituselt") | O | 1 |
| P4 | "Jaga koolitust" button | C45, O | 1 |
| P5 | "Sulle võiksid huvi pakkuda" recommendations at the very bottom | C46, O | 1 |
| P6 | ♡ favourite / "Lisa lemmikutesse" (browser now; student dashboard folder in phase 2) | C33, C44, O | 1 → 2 |
| P7 | Trainer info with active link to the trainer page | O | 1 |
| P8 | **E-learning**: description, video count, access period (e.g. 6 months), outcomes, language, payment options, module list visible but not openable, "includes knowledge test + practical-work assessment", certificate after completion | O | 1 |
| P9 | **E-learning payments**: (1) Maksa kohe — 100% bank link; (2) Vormista järelmaks — shown, enabled in phase 4 | O | 1 (UI) → 2/4 |
| P10 | **Contact**: description, outcomes, language, programme, payment options, trainer link, "Koolitus sisaldab" list (theory; practice e.g. on two models; materials to keep; trainer guidance and personal support; knowledge test; practical assessment; all tools provided; certificate on success) | O | 1 |
| P11 | Contact: "may bring own models; centre helps if needed" + form checkbox "Soovin koolituskeskuse abi modellide leidmisel" | O | 1 |
| P12 | Contact participation: **Grupikoolitus** → calendar of available dates, pick one; **Individuaalkoolitus** → request form (preferred period/date) → Maria | O | 1 |
| P13 | Group and individual have **different prices** | O | 1 |
| P14 | Contact payment: 100% now / 50% at registration + 50% on the day / instalment later | O | 1 (UI) → 2 |
| P15 | **Registration confirmed only after ≥50% prepayment**; the form alone does not confirm | O, C53 | 1 (status) → 2 |
| P16 | Checkbox "Loo mulle kohe konto MS LAB keskkonda" | O | 1 (stored) → 2 |
| P17 | Moderated student reviews under each course | C47 | 4 |

## Calendar (`/koolituskalender`)

| ID | Requirement | Source | Phase |
|---|---|---|---|
| L1 | A calendar kept overall | C20 | 1 |
| L2 | **Course name first and dominant** (size of A's city), city after it | C21 | 1 |
| L3 | Then city, format, seats etc. secondary | C21 | 1 |
| L4 | **Language tag** on each row | C21 | 1 |
| L5 | City visible on every row; city filter | E 26.09 | 1 |

## Practice (`/praktika`)

| ID | Requirement | Source | Phase |
|---|---|---|---|
| R1 | Intro text, MINI and MAXI packages, "Registreeru" | E 22.09 | 1 |
| R2 | Dark panel text: "Praktika toimub koolitaja juhendamisel…" + praktikaprotokoll explanation | E 26.09 | 1 |
| R3 | Package lists editable by Maria | E 26.09 | 1 |
| R4 | **Practice takes place only in Pärnu** — stated clearly | C22 | 1 |
| R5 | Duration per package, "Praktika" emphasised, price smaller in Jost (same as H10–H12) | C07–C09 | 1 |

## Trainer, blog

| ID | Requirement | Source | Phase |
|---|---|---|---|
| T1 | D trainer page kept as base | C29 | 1 |
| T2 | Small works gallery ("koolitaja tööd") under the portrait, 2–3 per row, carousel, open full size | C29 | 1 |
| T3 | "Koolituskeskuse lugu" section (editable) | C29 | 1 |
| T4 | "Koolitaja teekond" section (editable) | C29 | 1 |
| B1 | D blog section/page kept for now | C28 | 1 |

## Campaign popup

| ID | Requirement | Source | Phase |
|---|---|---|---|
| M1 | D popup design and behaviour kept | C37 | 1 |
| M2 | D admin editor kept | C38, C42 | 1 |
| M3 | Remove "Mitte praegu" | C39 | 1 |
| M4 | CTA wording "Leia enda koolitus" | C40, C41 | 1 |
| M5 | **Image upload** in the campaign editor | C43 | 1 |

## Student area

| ID | Requirement | Source | Phase |
|---|---|---|---|
| S1 | B student dashboard kept | C34 | 2 |
| S2 | Dashboard menu less clumsy | C35 | 2 |
| S3 | Favourites folder on the dashboard | C33, C44 | 2 |
| S4 | Several courses shown separately in one view | E 26.09 | 2 |
| S5 | Before starting an e-course: notice that access is personal and must not be shared + "Olen tutvunud ja nõustun tingimustega" | C54 | 2 |
| S6 | End-of-course feedback form: multiple choice + free text | C48 | 4 |
| S7 | Account auto-created on e-course purchase; login then learn | E 26.09 | 2 |

## Admin

| ID | Requirement | Source | Phase |
|---|---|---|---|
| A1 | B admin panel incl. left sidebar is the base | C51 | 1 |
| A2 | D badge editor kept | C36 | 1 |
| A3 | Waitlist ("Liitu ootenimekirjaga") kept | C49 | 1 |
| A4 | Filter **Kõik / E-õpe / Kontaktõpe** for students/registrations | C53 | 1 (registrations) → 2 (students) |
| A5 | Practical-work assessment: Maria defines N work steps per e-course; student uploads 1–3 photos per step; appears under "Hindamised"; comment per photo; approval → certificate; no certificate without approval | C50 | 3 |
| A6 | Contracts between centre and student, ideally digitally signed | C52 | 4 |
| A7 | Contact-course invoices 100% / 50%, PDF download, send to student dashboard and e-mail | C53 | 4 |
| A8 | Practice package lists, durations editable | C07, E 26.09 | 1 |
| A9 | Hero slides with light/dark setting editable | E 26.09 | 1 |

## Certificate

| ID | Requirement | Source | Phase |
|---|---|---|---|
| X1 | Generator: student name in the certificate's script font + date + certificate number | Dim 29.09 | 3 |
