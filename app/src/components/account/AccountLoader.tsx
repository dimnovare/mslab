"use client";

import Link from "next/link";
import { Icon } from "@/components/site/Icon";
import { Notice } from "@/components/site/Notice";
import ui from "@/components/site/ui.module.css";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import type { LoaderTexts } from "./texts";
import { useAccount, type Refusal } from "./useAccount";
import styles from "./AccountLoader.module.css";

/** Asks again: `quiet` keeps the page as it is while the new answer comes (useAccount). Answers whether the server answered. */
export type Reload = (options?: { quiet?: boolean }) => Promise<boolean>;

/**
 * "Sinu konto avati teises seadmes" and its one button, "Saada uus kood", which opens the login page with the code already
 * sent to the remembered e-mail (#korda=1: in the fragment, which no server or cache ever holds).
 */
export function ReplacedNotice({ locale, t }: { locale: Locale; t: { replaced: string; sendCode: string } }) {
  return (
    <div data-account-state="replaced">
      <Notice title={t.replaced}>
        <Link className={ui.btn} href={href(locale, "/konto/sisene#korda=1")}>
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
 * - A 404 that is the API's own answer (nothing for this client, e.g. an e-course without access): `notFound` when the page gives
 *   one — its own plain sentence, never hidden behind the error. Any other 404, and every 404 for a page without `notFound`, is an error.
 * - A 403 that is the API's own answer (a lesson not open yet, terms not accepted): `forbidden(refusal)` when the page gives it, with
 *   the API's reason and the lesson that is open instead. Any other 403, and every 403 for a page without `forbidden`, is an error.
 * - No answer, a server error or a 200 without a JSON object: "Ei õnnestunud laadida." and "Proovi uuesti".
 * - Loaded: `render(data, reload)`; `reload({ quiet: true })` refreshes it in the background.
 */
export function AccountLoader<T>({
  path,
  locale,
  t,
  render,
  skeleton,
  notFound,
  forbidden,
}: {
  path: string;
  locale: Locale;
  t: LoaderTexts;
  render(data: T, reload: Reload): React.ReactNode;
  skeleton?: React.ReactNode;
  /** What a 404 shows (nothing: the load error). */
  notFound?: React.ReactNode;
  /** What the API's 403 shows, from its reason (nothing: the load error). */
  forbidden?: (refusal: Refusal) => React.ReactNode;
}) {
  const { state, data, refusal, reload } = useAccount<T>(path, { locale, notFound: notFound !== undefined, forbidden: forbidden !== undefined });
  if (state === "ready" && data !== null) return render(data, reload);
  if (state === "replaced") return <ReplacedNotice locale={locale} t={t} />;
  if (state === "notFound" && notFound) return notFound;
  if (state === "forbidden" && forbidden && refusal) return forbidden(refusal);
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
