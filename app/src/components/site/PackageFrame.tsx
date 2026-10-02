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

function Tracked({ code, className, children }: { code: string; className: string; children: React.ReactNode }) {
  const selected = parsePackage(useUrlQuery()[0].get("pakett"), [code]) === code;
  return (
    <div className={className} data-package={code} data-selected={selected ? "true" : undefined}>
      {children}
    </div>
  );
}
