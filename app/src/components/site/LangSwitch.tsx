"use client";

import { usePathname } from "next/navigation";
import { publicPath, switchLocaleHref } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";

/** B's "ET / RU" toggle: one link to the same page in the other language (query and hash are kept). */
export function LangSwitch({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
  const to: Locale = locale === "et" ? "ru" : "et";
  const target = switchLocaleHref(publicPath(usePathname()), to);
  return (
    <a
      href={target}
      hrefLang={to}
      className={className}
      aria-label={`${label} (ET / RU)`}
      onClick={(e) => {
        const rest = window.location.search + window.location.hash;
        if (!rest) return;
        e.preventDefault();
        window.location.assign(target + rest);
      }}
    >
      ET <span aria-hidden="true">/</span> RU
    </a>
  );
}
