"use client";

import Link from "next/link";
import { Icon } from "@/components/site/Icon";
import { Notice } from "@/components/site/Notice";
import ui from "@/components/site/ui.module.css";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import type { LoaderTexts } from "./texts";
import { useAccount } from "./useAccount";
import styles from "./AccountLoader.module.css";

/** Asks again: `quiet` keeps the page as it is while the new answer comes (useAccount). */
export type Reload = (options?: { quiet?: boolean }) => void;

/**
 * "Sinu konto avati teises seadmes" and its one button, "Saada uus kood", which opens the login page with the code already
 * sent to the remembered e-mail (?korda=1).
 */
export function ReplacedNotice({ locale, t }: { locale: Locale; t: { replaced: string; sendCode: string } }) {
  return (
    <div data-account-state="replaced">
      <Notice title={t.replaced}>
        <Link className={ui.btn} href={href(locale, "/konto/sisene?korda=1")}>
          {t.sendCode}
          <Icon name="arrow" />
        </Link>
      </Notice>
    </div>
  );
}

/**
 * The personal part of an account page (/konto, /konto/lemmikud, /konto/andmed, /konto/kursus/…): the page itself is a
 * static shell, the same for every visitor, and this loads `path` (GET /api/konto…) in the browser.
 * - Loading: `skeleton` (the page's own stand-ins), or an empty space of a message's height; aria-busy.
 * - Not signed in: useAccount sends the visitor to the login page meanwhile (the waiting look stays).
 * - Another device signed in since (one device only): ReplacedNotice.
 * - No answer, a server error or a 200 without a JSON object: "Ei õnnestunud laadida." and "Proovi uuesti".
 * - Loaded: `render(data, reload)`; `reload({ quiet: true })` refreshes it in the background.
 */
export function AccountLoader<T>({
  path,
  locale,
  t,
  render,
  skeleton,
}: {
  path: string;
  locale: Locale;
  t: LoaderTexts;
  render(data: T, reload: Reload): React.ReactNode;
  skeleton?: React.ReactNode;
}) {
  const { state, data, reload } = useAccount<T>(path, { locale });
  if (state === "ready" && data !== null) return render(data, reload);
  if (state === "replaced") return <ReplacedNotice locale={locale} t={t} />;
  if (state === "error")
    return (
      <div data-account-state="error">
        <Notice title={t.loadError}>
          <button type="button" className={ui.btn} onClick={() => reload()}>
            {t.retry}
            <Icon name="arrow" />
          </button>
        </Notice>
      </div>
    );
  return (
    <div className={skeleton ? undefined : styles.wait} aria-busy="true" data-account-state={state}>
      <p className={ui.srOnly} role="status">
        {t.loading}
      </p>
      {skeleton}
    </div>
  );
}
