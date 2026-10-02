"use client";

import { parsePackage } from "@/domain/practice";
import { useUrlQuery } from "@/lib/url-query";

/**
 * A practice package card. With `track` (the practice page) it is marked `data-selected` while ?pakett names its code,
 * so the card outline follows the request form's choice (B `.practice-card.selected`); the URL is the shared state.
 */
export function PackageFrame({ code, className, track, children }: { code: string; className: string; track: boolean; children: React.ReactNode }) {
  return track ? (
    <Tracked code={code} className={className}>
      {children}
    </Tracked>
  ) : (
    <div className={className} data-package={code}>
      {children}
    </div>
  );
}

/**
 * On the practice page the card's "Registreeru" link (?pakett=<code>#taotlus on this same page) picks the package
 * right here: the address, the card outline and the request form follow, and the form scrolls into view, without a
 * navigation. (A Next.js navigation back to the address the page was opened with doubled its #taotlus.) Ctrl/⌘,
 * Shift, Alt and middle clicks are left to the browser.
 */
function Tracked({ code, className, children }: { code: string; className: string; children: React.ReactNode }) {
  const [query, writeQuery] = useUrlQuery();
  const selected = parsePackage(query.get("pakett"), [code]) === code;

  const pickHere = (e: React.MouseEvent<HTMLDivElement>) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const to = new URL(link.href);
    if (to.origin !== window.location.origin || to.pathname !== window.location.pathname) return;
    e.preventDefault(); // before next/link's own handler (this one runs in the capture phase)
    const next = new URLSearchParams(window.location.search);
    next.set("pakett", code);
    writeQuery(next, to.hash);
    const target = to.hash ? document.getElementById(decodeURIComponent(to.hash.slice(1))) : null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className={className} data-package={code} data-selected={selected ? "true" : undefined} onClickCapture={pickHere}>
      {children}
    </div>
  );
}
