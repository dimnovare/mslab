"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { HINT_COOKIE } from "@/lib/account-cookies";

// The client account in the browser. The /konto… pages are static shells, the same for every visitor (served by the CDN
// without a render); everything personal comes from /api/konto/* after the page has loaded, read here.
//
// - `mslab_in=1` is a readable hint cookie the API sets next to the HttpOnly session cookie (server/account-api.ts). It
//   grants nothing: it only lets a cached page show "Minu konto" instead of "Logi sisse" without asking the server.
// - The last e-mail this browser signed in with is kept in localStorage, so the login page can fill it in and "Saada uus
//   kood" (another device signed in) can send a code to it at once.

/** localStorage key of the last e-mail used to sign in here. */
export const EMAIL_KEY = "mslab-email";
/** Fired on window when this tab learns that the sign-in state changed (the hint cookie was set or cleared). */
export const ACCOUNT_EVENT = "mslab-account-change";

/** Does a Cookie string carry the hint `mslab_in=1`? */
export const hintIn = (cookie: string): boolean => cookie.split(";").some((part) => part.trim() === `${HINT_COOKIE}=1`);

/** Is this browser signed in, as far as the hint cookie says? Reads document.cookie only: no request. False on the server. */
export function hasAccountHint(): boolean {
  return typeof document !== "undefined" && hintIn(document.cookie);
}

/** For useSyncExternalStore: the hint is read again when this tab says it changed, and when the tab comes back into view. */
export function subscribeAccountHint(onChange: () => void): () => void {
  const events = [ACCOUNT_EVENT, "focus", "pageshow"];
  for (const e of events) window.addEventListener(e, onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    for (const e of events) window.removeEventListener(e, onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** The last e-mail used to sign in in this browser, or "" (storage blocked, nothing kept). */
export function rememberedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Keeps the e-mail for the next login in this browser (silently nothing when storage is blocked). */
export function rememberEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // private mode or blocked storage: the field simply starts empty next time
  }
}

/** The login page of a locale: "/konto/sisene" or "/ru/konto/sisene" (without one, the locale of the address shown). */
export const loginPath = (locale?: Locale): string =>
  href(locale ?? (/^\/ru(\/|$)/.test(window.location.pathname) ? "ru" : "et"), "/konto/sisene");

export type AccountState = "loading" | "ready" | "signedOut" | "replaced" | "notFound" | "error";

type Loaded<T> = { state: AccountState; data: T | null };

/**
 * Loads one account endpoint (`path`, e.g. "/api/konto/me") with the session cookie.
 * - 200: "ready" with the JSON as `data`; an `email` in it (or `client.email`, the dashboard's) is remembered for the next login in this browser.
 * - 401 `{ reason: "replaced" }` (another device signed in): "replaced", for the page to say so with one "Saada uus kood".
 * - any other 401 (never signed in, logged out, 180 days unused): "signedOut", and the visitor is sent to the login page of
 *   `locale` (the page's own; without it, the locale of the address) — `redirect: false` keeps them here.
 * - 404 with the API's own JSON answer (`{ ok: false, … }`: there is nothing for this client, e.g. an e-course without access), when the
 *   page asked for it with `notFound: true`: "notFound", for the page to say so; a quiet reload that learns it moves the page there too
 *   (it is an answer, not a failure). Any other 404 (a page of the platform, no JSON) and every 404 for a page that did not ask are
 *   plain failures, as below.
 * - anything else, no answer, or a 200 without a JSON object: "error"; `reload()` asks again.
 * A 401 has cleared the hint cookie, so the header is told to show "Logi sisse" again.
 * `reload({ quiet: true })` asks again in the background: the page keeps showing what it has ("ready" and the old data)
 * until the new answer is in, and a failure leaves it as it is; a 401 still ends the page as above.
 * `reload()` answers with a promise: true when the server gave an answer the page now shows (also a 401 or a 404 that ends it), false
 * when it did not (no answer, an error status, a broken body: a quiet reload then leaves the page as it was). A reload that a newer
 * one overtakes answers false.
 */
export function useAccount<T>(
  path: string,
  options: { redirect?: boolean; locale?: Locale; notFound?: boolean } = {},
): { state: AccountState; data: T | null; reload(options?: { quiet?: boolean }): Promise<boolean> } {
  const redirect = options.redirect ?? true;
  const locale = options.locale;
  const wantsNotFound = options.notFound === true;
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading", data: null });
  const [round, setRound] = useState({ n: 0, quiet: false });
  /**
   * What the latest reload() waits for, with the round it asked in: only that round's answer settles it (an older round that is still
   * on its way cannot answer a newer reload; an effect that is dropped, as the dev server's second run is, never settles it).
   */
  const waiting = useRef<{ n: number; resolve: (answered: boolean) => void } | null>(null);
  const rounds = useRef(0);
  const settle = useCallback((n: number, answered: boolean) => {
    const pending = waiting.current;
    if (pending?.n !== n) return;
    waiting.current = null;
    pending.resolve(answered);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const quiet = round.quiet;
    const n = round.n;
    (async () => {
      let res: Response;
      let body: unknown;
      try {
        res = await fetch(path, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, signal: abort.signal });
        body = await res.json().catch(() => null);
      } catch {
        if (abort.signal.aborted) return;
        if (!quiet) setLoaded({ state: "error", data: null });
        return settle(n, false);
      }
      if (abort.signal.aborted) return;
      const isObject = body !== null && typeof body === "object" && !Array.isArray(body);
      // A 200 without a JSON object (an empty or broken answer) is no data: an error, or for a quiet reload nothing.
      if (res.ok && !isObject) {
        if (!quiet) setLoaded({ state: "error", data: null });
        return settle(n, false);
      }
      if (res.ok) {
        // /me answers { email }, the dashboard { client: { email } }
        const answer = body as { email?: unknown; client?: { email?: unknown } } | null;
        const email = answer?.email ?? answer?.client?.email;
        if (typeof email === "string" && email) rememberEmail(email);
        setLoaded({ state: "ready", data: body as T });
        return settle(n, true);
      }
      if (res.status === 401) {
        window.dispatchEvent(new Event(ACCOUNT_EVENT));
        const replaced = (body as { reason?: unknown } | null)?.reason === "replaced";
        // signed out: the page keeps its waiting look while the login page loads
        if (!replaced && redirect) window.location.replace(loginPath(locale));
        setLoaded({ state: replaced ? "replaced" : "signedOut", data: null });
        return settle(n, true);
      }
      if (res.status === 404 && wantsNotFound && isObject && (body as { ok?: unknown }).ok === false) {
        setLoaded({ state: "notFound", data: null });
        return settle(n, true);
      }
      if (!quiet) setLoaded({ state: "error", data: null });
      settle(n, false);
    })();
    return () => abort.abort();
  }, [path, redirect, locale, wantsNotFound, round, settle]);

  const reload = useCallback((opts: { quiet?: boolean } = {}): Promise<boolean> => {
    const quiet = opts.quiet === true;
    waiting.current?.resolve(false); // an earlier reload that has not been answered is overtaken
    const n = ++rounds.current;
    const answered = new Promise<boolean>((resolve) => {
      waiting.current = { n, resolve };
    });
    if (!quiet) setLoaded({ state: "loading", data: null });
    setRound({ n, quiet });
    return answered;
  }, []);

  return { state: loaded.state, data: loaded.data, reload };
}
