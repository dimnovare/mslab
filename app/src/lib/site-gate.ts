// The coming-soon gate (hotfix 08.10): mslab.ee serves the new site while its content is still sample content, so with the
// setting SITE_GATE on, a visitor is answered with the coming-soon page (app/tulekul/[locale]) whatever the address,
// and only an admin's preview cookie (lib/preview-cookie.ts) lets the request through to the site as it is. Unset (local
// development, the e2e run) the site behaves exactly as without it; the launch removes SITE_GATE. The decision is a plain
// function (tested without Next.js); src/middleware.ts answers with it.

import { verifyPreview } from "./preview-cookie";

/**
 * The coming-soon page of each language: what the middleware rewrites a gated page request to. Under its own root layout
 * (app/tulekul/[locale]), not the site's app/[locale]: built with the app and read from nothing. Not a page of the site:
 * asked for by its address (gate off, or an admin), lib/site-routing.ts answers with the 404 page.
 */
export const GATE_PAGES = { et: "/tulekul/et", ru: "/tulekul/ru" } as const;

export type GatePage = (typeof GATE_PAGES)[keyof typeof GATE_PAGES];

/** The two settings, as process.env has them (server/env.ts gateEnv). */
export type GateEnv = { SITE_GATE?: string; PREVIEW_SECRET?: string };

export type GateRequest = { path: string; method: string; cookie: string | undefined };

export type GateDecision =
  /** answered as without the gate */
  | { kind: "pass" }
  /** answered with the coming-soon page of `page`'s language; `api`: an /api address, answered without a page */
  | { kind: "gate"; page: GatePage; api: boolean };

const PASS: GateDecision = { kind: "pass" };

/** Values of SITE_GATE that mean off. Unset or blank is off too; any other value is on, so a typo keeps the site closed. */
const OFF = new Set(["0", "false", "off", "no"]);

/** Is the gate on for this value of SITE_GATE? */
export function gateOn(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return !!v && !OFF.has(v);
}

/**
 * Addresses answered by the app itself, gate or not. Each ends at a path boundary or is one exact file, as in
 * lib/site-routing.ts ("/administrator" or "/admin.php" are gated):
 * - the admin area and its API, and signing in and out (api/auth: request, verify, logout);
 * - Vercel's daily cron, Bunny's webhook, and the newsletter's confirm link (it sends the visitor on to "/", the coming-soon
 *   page, which shows the notice);
 * - Next.js's own files, the uploaded images (/media) and the static files of public/ (the logo, the icons, the link preview
 *   picture, robots.txt, the seed pictures, the review widget's script): tests/unit/site-gate.test.ts checks every entry of
 *   public/ against it. The design-review hub (public/guide, public/p) is gated: it shows the prototypes.
 * Fonts are Next.js's files (/_next/static/media). Not here, so gated: the client account and its API, /api/feedback,
 * the hub and every page of the site.
 */
const THROUGH =
  /^\/(admin(\/|$)|api\/(auth|admin|cron|newsletter)(\/|$)|api\/bunny\/webhook$|_next\/|media(\/|$)|brand\/|seed\/|(favicon\.ico|icon\.svg|robots\.txt|og\.jpg|feedback\.js)$)/;

/**
 * A path the router could read as another one: a dot segment ("/admin/../konto"), an encoded dot, slash or backslash, a
 * backslash, or two slashes in a row. A browser never sends one (the URL parser removes real dot segments before the
 * middleware sees the path); such a path never goes through, whatever its first segment.
 */
const UNCLEAN = /(^|\/)\.{1,2}(\/|$)|%2e|%2f|%5c|\\|\/\//i;

/** Is `path` one of the addresses that always go through (see THROUGH)? */
export function alwaysThrough(path: string): boolean {
  return THROUGH.test(path) && !UNCLEAN.test(path);
}

/** The coming-soon page for `path`: the Russian one for /ru…, the Estonian one for everything else. */
export function gatePage(path: string): GatePage {
  return /^\/ru(\/|$)/.test(path) ? GATE_PAGES.ru : GATE_PAGES.et;
}

/**
 * What the gate does with a request. Gate off: pass. Gate on: the always-through addresses pass, and so does every request
 * with a valid preview cookie; the rest is gated, whatever the method (a server action is a POST to the page's own
 * address: the coming-soon page's newsletter form is answered by the coming-soon page). Without PREVIEW_SECRET no cookie is
 * valid (fail closed). `now` in ms, for the tests.
 */
export async function gateDecision(req: GateRequest, env: GateEnv, now: number = Date.now()): Promise<GateDecision> {
  if (!gateOn(env.SITE_GATE)) return PASS;
  if (alwaysThrough(req.path)) return PASS;
  if (await verifyPreview(req.cookie, env.PREVIEW_SECRET, now)) return PASS;
  return { kind: "gate", page: gatePage(req.path), api: /^\/api(\/|$)/.test(req.path) };
}
