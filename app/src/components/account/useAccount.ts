"use client";

import { useCallback, useEffect, useState } from "react";
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

export type AccountState = "loading" | "ready" | "signedOut" | "replaced" | "error";

type Loaded<T> = { state: AccountState; data: T | null };

/**
 * Loads one account endpoint (`path`, e.g. "/api/konto/me") with the session cookie.
 * - 200: "ready" with the JSON as `data`; an `email` in it (or `client.email`, the dashboard's) is remembered for the next login in this browser.
 * - 401 `{ reason: "replaced" }` (another device signed in): "replaced", for the page to say so with one "Saada uus kood".
 * - any other 401 (never signed in, logged out, 180 days unused): "signedOut", and the visitor is sent to the login page of
 *   `locale` (the page's own; without it, the locale of the address) — `redirect: false` keeps them here.
 * - anything else, or no answer: "error"; `reload()` asks again.
 * A 401 has cleared the hint cookie, so the header is told to show "Logi sisse" again.
 */
export function useAccount<T>(path: string, options: { redirect?: boolean; locale?: Locale } = {}): { state: AccountState; data: T | null; reload(): void } {
  const redirect = options.redirect ?? true;
  const locale = options.locale;
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading", data: null });
  const [round, setRound] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      let res: Response;
      let body: unknown;
      try {
        res = await fetch(path, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, signal: abort.signal });
        body = await res.json().catch(() => null);
      } catch {
        if (!abort.signal.aborted) setLoaded({ state: "error", data: null });
        return;
      }
      if (abort.signal.aborted) return;
      if (res.ok) {
        // /me answers { email }, the dashboard { client: { email } }
        const answer = body as { email?: unknown; client?: { email?: unknown } } | null;
        const email = answer?.email ?? answer?.client?.email;
        if (typeof email === "string" && email) rememberEmail(email);
        setLoaded({ state: "ready", data: body as T });
        return;
      }
      if (res.status === 401) {
        window.dispatchEvent(new Event(ACCOUNT_EVENT));
        const replaced = (body as { reason?: unknown } | null)?.reason === "replaced";
        // signed out: the page keeps its waiting look while the login page loads
        if (!replaced && redirect) window.location.replace(loginPath(locale));
        setLoaded({ state: replaced ? "replaced" : "signedOut", data: null });
        return;
      }
      setLoaded({ state: "error", data: null });
    })();
    return () => abort.abort();
  }, [path, redirect, locale, round]);

  const reload = useCallback(() => {
    setLoaded({ state: "loading", data: null });
    setRound((n) => n + 1);
  }, []);

  return { state: loaded.state, data: loaded.data, reload };
}
