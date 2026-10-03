"use client";

import Link from "next/link";
import { Icon } from "@/components/site/Icon";
import { Notice } from "@/components/site/Notice";
import ui from "@/components/site/ui.module.css";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { useAccount } from "./useAccount";
import styles from "./AccountGate.module.css";

export type SignedOutTexts = { replaced: string; sendCode: string; error: string; retry: string };

/**
 * The signed-in part of an account page (/konto…), shown once /api/konto/me says who the visitor is. Until then an empty
 * space of the same height (the static shell is the same for everyone). Not signed in: useAccount sends the visitor to the
 * login page. Signed in on another device since (one device only): "Sinu konto avati teises seadmes" and one button,
 * "Saada uus kood", which opens the login page with the code already sent to the remembered e-mail (?korda=1).
 */
export function AccountGate({ locale, t, children }: { locale: Locale; t: SignedOutTexts; children: React.ReactNode }) {
  const { state, reload } = useAccount<{ email: string; name: string }>("/api/konto/me", { locale });

  if (state === "ready") return children;
  if (state === "replaced")
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
  if (state === "error")
    return (
      <div data-account-state="error">
        <Notice title={t.error}>
          <button type="button" className={ui.btn} onClick={reload}>
            {t.retry}
            <Icon name="arrow" />
          </button>
        </Notice>
      </div>
    );
  return <div className={styles.wait} aria-busy="true" data-account-state={state} />;
}
