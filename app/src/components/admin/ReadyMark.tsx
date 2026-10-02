"use client";

import { useEffect } from "react";

/**
 * Marks <html data-admin-ready> once the admin page has hydrated (an effect runs after React's commit). The e2e tests
 * wait for it before typing into an editor: text typed into a controlled field while React is still taking the page
 * over can be overwritten by the field's server value.
 */
export function ReadyMark() {
  useEffect(() => {
    document.documentElement.dataset.adminReady = "1";
  }, []);
  return null;
}
