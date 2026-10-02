"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

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
// - a write keeps Next.js's history state on the entry, so Back works whatever the timing;
// - the router is told about the new URL in an effect after the write's render. By then its patch is in place: React
//   flushes the effects of the hydration commit (the App Router's patch among them) before it renders again.

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

/**
 * The page's query string as live state, and a writer for it. The writer replaces the whole query (pass the
 * merged params: other parameters are the caller's to keep) and keeps the path, and the hash unless one is given.
 */
export function useUrlQuery(): [URLSearchParams, (next: URLSearchParams, hash?: string) => void] {
  const pathname = usePathname();
  const routerQuery = useSearchParams().toString();
  const query = useSyncExternalStore(
    subscribe,
    // While Next.js renders a navigation to this page, the address bar still shows the page being left: until it
    // shows this page, the router's query is the one to render.
    () => (window.location.pathname === pathname ? new URLSearchParams(window.location.search).toString() : routerQuery),
    () => routerQuery,
  );
  const tellRouter = useRef(false);

  // A Next.js navigation (a link to this page with another query, Back/Forward) changes useSearchParams, and the
  // address bar in the same commit: read it again now that it has.
  useEffect(notify, [routerQuery]);

  useEffect(() => {
    if (!tellRouter.current) return;
    tellRouter.current = false;
    // `null` state: Next.js's replaceState copies its own state over and moves its router to this URL (useSearchParams,
    // the URL it writes back on its next navigation).
    window.history.replaceState(null, "", window.location.href);
  }, [query]);

  const write = useCallback((next: URLSearchParams, hash: string = window.location.hash) => {
    const qs = next.toString();
    if (qs === new URLSearchParams(window.location.search).toString() && hash === window.location.hash) return; // nothing changes
    // Next.js's history state stays on the entry (its own replaceState passes it through unchanged).
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${hash}`);
    tellRouter.current = true;
    notify();
  }, []);

  return [useMemo(() => new URLSearchParams(query), [query]), write];
}
