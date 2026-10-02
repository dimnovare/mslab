"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

// Page state kept in the query string (catalogue and calendar filters, the practice package), changed in place with
// history.replaceState: no server round trip, and the address bar, a reload, Back/Forward and links all agree.
//
// Why not just useSearchParams() + history.replaceState: Next.js learns about a replaceState only once its App Router
// has patched `history`, which it does in an effect after hydration. A tap that lands after hydration but before that
// effect (a slow phone, a busy machine) changed the address bar while Next.js kept the old URL, so useSearchParams() —
// and the list it filtered — stayed on the old query, and the history entry lost Next.js's own state (Back to it did
// nothing). The e2e filter tests failed this way under parallel load. So:
// - the value comes from the address bar itself, re-read after every write, on popstate and after every Next.js
//   navigation (useSearchParams only says *when* one happened);
// - when Next.js follows history changes (its patch is in place), a write goes through its replaceState at once: it
//   copies its state onto the entry and moves its router to the new URL within the click;
// - before that, a write keeps Next.js's history state on the entry itself, and the router is caught up at the start
//   of the visitor's next press, key or click (capture phase: before any link handler), while the address is still the
//   one written. Never later, never from an effect, and not at all once the visitor has moved on or clicked before the
//   router follows: telling the router while a link's navigation is pending cancels the navigation (Next.js lets the
//   newer URL win), and an effect can run after the next click.

const CHANGED = "mslab:query";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

const notify = (): void => {
  window.dispatchEvent(new Event(CHANGED));
};

/** Next.js follows history.replaceState: its App Router's patch is an own property of window.history. */
const routerFollows = (): boolean => Object.prototype.hasOwnProperty.call(window.history, "replaceState");

/** The address an early write left in the address bar while Next.js's router still had the previous one; null if none. */
let behindAt: string | null = null;

/**
 * What to do about an early write at the start of a press, key or click: "tell" the router now (it follows history
 * changes and the address is still the one written); "drop" it (the address has moved on, or a click comes while the
 * router still does not follow: a navigation may start from it, and a later RESTORE would cancel that navigation;
 * the entry keeps Next.js's state, so Back still works); otherwise "wait".
 */
export function catchUpDecision(at: { behindAt: string | null; href: string; follows: boolean; event: string }): "tell" | "drop" | "wait" {
  if (at.behindAt === null) return "wait";
  if (at.href !== at.behindAt) return "drop";
  if (at.follows) return "tell";
  return at.event === "click" ? "drop" : "wait";
}

/**
 * Catches Next.js's router up with the address bar (see catchUpDecision). `null` state: its replaceState copies its own
 * state over and moves its router to this URL (useSearchParams, the URL it writes back later).
 */
function catchUpRouter(e: Event): void {
  const decision = catchUpDecision({ behindAt, href: window.location.href, follows: routerFollows(), event: e.type });
  if (decision === "wait") return;
  behindAt = null;
  if (decision === "tell") window.history.replaceState(null, "", window.location.href);
}

if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "keydown", "click"]) window.addEventListener(type, catchUpRouter, true);
}

// The public pages are rendered once and cached for every visitor, whatever the query (incremental static
// regeneration), so the server renders them as if the address had no query, and the browser applies it after
// hydration. On the server, useSearchParams() would also make Next.js give up the server rendering of the page; it is
// called in the browser only (the choice is fixed per bundle, so the hook order never changes within one).
function useRouterQueryInBrowser(): string {
  return useSearchParams().toString();
}
function useNoQueryOnServer(): string {
  return "";
}
const useRouterQuery = typeof window === "undefined" ? useNoQueryOnServer : useRouterQueryInBrowser;

/**
 * The page's query string as live state, and a writer for it. The writer replaces the whole query (pass the
 * merged params: other parameters are the caller's to keep) and keeps the path, and the hash unless one is given.
 * Empty on the server and while the page hydrates (what the cached server rendering shows), the address's own
 * query right after.
 */
export function useUrlQuery(): [URLSearchParams, (next: URLSearchParams, hash?: string) => void] {
  const pathname = usePathname();
  const routerQuery = useRouterQuery();
  const query = useSyncExternalStore(
    subscribe,
    // While Next.js renders a navigation to this page, the address bar still shows the page being left: until it
    // shows this page, the router's query is the one to render.
    () => (window.location.pathname === pathname ? new URLSearchParams(window.location.search).toString() : routerQuery),
    () => "",
  );

  // A Next.js navigation (a link to this page with another query, Back/Forward) changes useSearchParams, and the
  // address bar in the same commit: read it again now that it has.
  useEffect(notify, [routerQuery]);

  const write = useCallback((next: URLSearchParams, hash: string = window.location.hash) => {
    const qs = next.toString();
    if (qs === new URLSearchParams(window.location.search).toString() && hash === window.location.hash) return; // nothing changes
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${hash}`;
    if (routerFollows()) {
      behindAt = null; // this write brings the router up to date as well
      window.history.replaceState(null, "", url); // through Next.js: entry state and router follow at once
    } else {
      window.history.replaceState(window.history.state, "", url); // Next.js's state stays on the entry
      behindAt = window.location.href;
    }
    notify();
  }, []);

  return [useMemo(() => new URLSearchParams(query), [query]), write];
}
