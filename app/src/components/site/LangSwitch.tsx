"use client";

import { usePathname } from "next/navigation";
import { publicPath, switchLocaleHref } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";

/**
 * B's "ET / RU" toggle: one link to the same page in the other language (query and hash are kept).
 * The server knows only the path, so the query and hash of the page as it is now are added to the link's address just
 * before the browser follows it. The browser then does what the visitor asked: a plain click opens it here; Ctrl/⌘,
 * Shift or a middle click open a new tab or window, and "copy link" copies the full address.
 */
export function LangSwitch({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
  const to: Locale = locale === "et" ? "ru" : "et";
  const target = switchLocaleHref(publicPath(usePathname()), to);
  const withState = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.href = target + window.location.search + window.location.hash;
  };
  return (
    <a href={target} hrefLang={to} className={className} aria-label={`${label} (ET / RU)`} onClick={withState} onAuxClick={withState} onContextMenu={withState}>
      ET <span aria-hidden="true">/</span> RU
    </a>
  );
}
