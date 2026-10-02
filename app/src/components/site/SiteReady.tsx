"use client";

import { useEffect } from "react";

/**
 * Marks <html data-site-ready> once a public page has hydrated (an effect runs after React's commit), as the admin's
 * ReadyMark does. The e2e tests wait for it after opening a page (tests/e2e/test.ts): a click that lands before React has
 * taken the page over does nothing (seen under parallel load on the dev server). Nothing visitor-specific: the cached
 * page itself is the same for everyone.
 */
export function SiteReady() {
  useEffect(() => {
    document.documentElement.dataset.siteReady = "1";
  }, []);
  return null;
}
