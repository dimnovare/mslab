"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { publicPath } from "@/i18n/href";
import styles from "./Header.module.css";

/** B: the home header turns white once the page has scrolled past this many pixels. */
const SCROLL_LIMIT = 40;

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

// The home hero (Task 7) writes the current slide tone to <html data-hero-tone="light|dark">.
function subscribeTone(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hero-tone"] });
  return () => observer.disconnect();
}

/**
 * The <header> element and its state. Over the hero (home page by default) it is transparent and takes
 * its text colour from the hero tone; after SCROLL_LIMIT px it turns white with ink text. Elsewhere it is white.
 */
export function HeaderFrame({ homePath, overHero, children }: { homePath: string; overHero?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const over = overHero ?? publicPath(pathname) === homePath;
  const scrolled = useSyncExternalStore(subscribeScroll, () => window.scrollY > SCROLL_LIMIT, () => false);
  const dark = useSyncExternalStore(subscribeTone, () => document.documentElement.dataset.heroTone === "dark", () => false);
  const className = [
    styles.header,
    over && styles.overHero,
    over && scrolled && styles.scrolled,
    over && !scrolled && dark && styles.lightInk,
  ]
    .filter(Boolean)
    .join(" ");
  return <header className={className}>{children}</header>;
}
