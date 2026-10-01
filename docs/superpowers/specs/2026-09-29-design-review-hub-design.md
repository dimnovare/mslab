# MS LAB — design review hub (mslab.diipsolutions.eu/guide)

Date: 2026-09-29 · Approved by Dim in chat.

## Goal
Give Maria (client, MS LAB Koolituskeskus) one Estonian page where she can open every design
direction, click through its screens and see it at desktop, tablet and phone width, then pick a
direction. Same idea as the Rempire `/demo` hub, without the feedback/comment layer.

## Content
Main directions (cards on the hub):

| Key | Source | Folder | Notes |
|---|---|---|---|
| A | Source 1 v2 (`MS LAB Visual Studies_1.zip`) | `site/p/a/` | v1 + Maria's first-round fixes. The hero she praised. |
| B | Source 2 "Learning Journey" (`MS-LAB-Learning-Journey.zip`) | `site/p/b/` | Direction A + journey layer. |
| C | Source 3 (`HANDOFF.md` spec only) | `site/p/c/` | Static rebuild from the spec; marked as rebuilt. |
| D | New, "Studio" | `site/p/studio/` | Built here from all inputs + Maria's reference images and feedback. |

Archive ("Varasemad versioonid"): Source 1 v1 (`site/p/a0/`), Source 2 direction A
(`site/p/b0/`), Source 1 visual studies moodboard (`site/p/moodboard/`).

Excluded from publishing: WordPress XML, `uploads/`, `certificate-ref.jpg` and the TUNNISTUS
photo (real student name), Maria's inspiration screenshots.

## Hub (`site/guide/index.html`)
- Estonian copy, Apple-minimal, Maria's palette (#222222 ink, #9E8993 → #EBE8E9).
- Direction cards: thumbnail, name, 3 lines on what differs, "Ava" (new tab) and "Eelvaade".
- Viewer: iframe with Desktop 1440 / Tablet 834 / Mobiil 390; the frame renders at true width and
  is scaled down to fit the window. Quick links to main screens where the prototype supports
  deep links.
- `noindex`, no analytics, no feedback collection.
- Root `/` redirects to `/guide/`.

## Direction D — Studio
Static multi-page HTML/CSS/JS, hash routing, ET copy (RU switch visible, not translated).
- Full-bleed edge-to-edge hero, 5 slides, header over it; each slide declares light/dark and the
  header text/logo follow it. Supporting hero text at least 17px.
- Palette: Maria's swatch — Ashen Rose #9E8993, Iced Petal #AD9FA6, Morning Fog #C0B7BB,
  Pale Heather #D5D0D3, First Light #EBE8E9; ink #222222; Orchid Tint surface.
- Screens: Avaleht (hero, upcoming with city, formats with 01→05 horizontal steps, blog carousel
  with clickable cards, trainer, "Sinu koolitusega kaasa", practice teaser, reviews, newsletter,
  footer), Koolitused (format + level filters, per-format explainer and steps, badges), Koolitus
  detail, Uudis (article), Kalender (city column + city filter), Praktika (Maria's texts,
  protokoll, MINI/MAXI, registreeru), Õppija (4 courses), Admin (badge editor with live preview,
  editable MINI/MAXI lists).
- Real photos from Maria where supplied; stock stand-ins marked "näidispilt" in the hub notes.

## Hosting
Cloudflare Pages project `mslab-guide`, custom domain `mslab.diipsolutions.eu` (zone
diipsolutions.eu is on Cloudflare). Needs `wrangler login` by Dim. Fallback: Vercel project +
CNAME in Cloudflare.

## Verification
Every direction opens from the hub without console errors; viewer works at the three widths;
Studio checked at 390, 834, 1440, 2560 with no horizontal overflow.
