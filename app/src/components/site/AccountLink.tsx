"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { hasAccountHint, subscribeAccountHint } from "@/components/account/useAccount";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import styles from "./Header.module.css";

/**
 * The header's account button: "Logi sisse" (→ the login page) or, once this browser is signed in, "Minu konto" (→ /konto).
 * The page is cached and the same for everyone, so the server renders "Logi sisse"; after hydration the browser reads the
 * `mslab_in` hint cookie (no request) and switches. Both labels sit in the same grid cell, the other one hidden, so the
 * button keeps its width and nothing around it moves when it switches.
 */
export function AccountLink({ locale, login, account, className }: { locale: Locale; login: string; account: string; className: string }) {
  const signedIn = useSyncExternalStore(subscribeAccountHint, hasAccountHint, () => false);
  return (
    <Link className={className} href={href(locale, signedIn ? "/konto" : "/konto/sisene")} data-account-link={signedIn ? "in" : "out"}>
      <span className={styles.accountLabels}>
        <span aria-hidden={signedIn}>{login}</span>
        <span aria-hidden={!signedIn}>{account}</span>
      </span>
    </Link>
  );
}
