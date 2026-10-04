"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "@/components/site/Icon";
import ui from "@/components/site/ui.module.css";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { forgetAccountFavourites } from "@/lib/favourites";
import { forgetChangeRequests } from "./sent-requests";
import type { ShellTexts } from "./texts";
import { ACCOUNT_EVENT, hasAccountHint, subscribeAccountHint } from "./useAccount";
import styles from "./AccountShell.module.css";

export type AccountTab = "courses" | "favourites" | "details";

/** The three tabs (spec section 6, C35): Minu koolitused · Lemmikud · Minu andmed. */
const TABS: { key: AccountTab; path: string; icon: IconName }[] = [
  { key: "courses", path: "/konto", icon: "book" },
  { key: "favourites", path: "/konto/lemmikud", icon: "heart" },
  { key: "details", path: "/konto/andmed", icon: "user" },
];

/** Every visitor of a static /konto page is shown the frame first; most of them are signed in (the server knows no one). */
const serverHint = () => true;

/**
 * The frame of the account pages, in prototype B's student area under the site's own header (B `studentHeader`, with the
 * simpler menu of C35):
 * - a computer: the three tabs at the top, the round menu button with "Logi välja" at their right;
 * - a phone: the tab's name and the menu button at the top, the tabs in a bar with icons and labels at the bottom of the
 *   screen. The bar is sticky at the end of the frame, so it takes its own room (it never covers a card) and stops above
 *   the footer; the review build's comment button moves up above it (data-fab-avoid).
 * The frame shows while this browser is signed in as far as the hint cookie says: an answer that another device signed in
 * clears the cookie, and only the page's message is left. `readOnly` (the admin's "view as client", with a `banner`): the
 * frame always shows, and the tabs and the menu are aria-disabled and do nothing.
 */
export function AccountShell({
  tab,
  locale,
  t,
  readOnly = false,
  banner,
  children,
}: {
  tab: AccountTab;
  locale: Locale;
  t: ShellTexts;
  readOnly?: boolean;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const hint = useSyncExternalStore(subscribeAccountHint, hasAccountHint, serverHint);
  const framed = readOnly || hint;
  const links = TABS.map((item) => {
    const current = item.key === tab;
    const inner = (
      <>
        <Icon name={item.icon} size={22} />
        <span>{t[item.key]}</span>
      </>
    );
    return readOnly ? (
      <a key={item.key} className={styles.tab} role="link" aria-disabled="true" aria-current={current ? "page" : undefined}>
        {inner}
      </a>
    ) : (
      <Link key={item.key} className={styles.tab} href={href(locale, item.path)} aria-current={current ? "page" : undefined}>
        {inner}
      </Link>
    );
  });

  return (
    <div className={styles.shell} data-account-shell="" data-read-only={readOnly || undefined}>
      {banner && (
        <div className={ui.wrap}>
          <p className={styles.banner} role="note" data-account-banner="">
            {banner}
          </p>
        </div>
      )}
      {framed && (
        <div className={`${ui.wrap} ${styles.top}`}>
          <nav className={styles.tabs} aria-label={t.label} data-account-tabs="top">
            {links}
          </nav>
          <p className={`${ui.eyebrow} ${styles.here}`}>{t[tab]}</p>
          <AccountMenu locale={locale} t={t} readOnly={readOnly} />
        </div>
      )}
      <div className={styles.content}>{children}</div>
      {framed && (
        <nav className={styles.bar} aria-label={t.label} data-account-tabs="bottom" data-fab-avoid="">
          {links}
        </nav>
      )}
    </div>
  );
}

/**
 * The round button (B `.avatar`) and its one choice, "Logi välja": the session ends on the server (POST
 * /api/konto/logout clears both cookies), this tab forgets its account memory (the change requests sent, the copy of the
 * favourites), and the student is taken to the home page in the page's language, where the header says "Logi sisse" again. A failed request says so and stays. Esc, a tap elsewhere or the button again close it.
 */
function AccountMenu({ locale, t, readOnly }: { locale: Locale; t: ShellTexts; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const panelId = useId();
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    const onOutside = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/konto/logout", { method: "POST", credentials: "same-origin" });
      if (!res.ok) throw new Error(`logout ${res.status}`);
    } catch {
      setBusy(false);
      setFailed(true);
      return;
    }
    forgetChangeRequests();
    forgetAccountFavourites(); // the course pages' ♡ shows this browser's own list again
    window.dispatchEvent(new Event(ACCOUNT_EVENT)); // the hint cookie is gone: the header says "Logi sisse"
    window.location.assign(href(locale, "/"));
  };

  if (readOnly)
    return (
      <div className={styles.menu}>
        <button type="button" className={styles.avatar} aria-label={t.menu} aria-disabled="true" data-account-menu="">
          <span className={styles.face}>
            <Icon name="user" size={18} />
          </span>
        </button>
      </div>
    );

  return (
    <div className={styles.menu} ref={box}>
      <button
        ref={toggle}
        type="button"
        className={styles.avatar}
        aria-label={t.menu}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-account-menu=""
      >
        <span className={styles.face}>
          <Icon name="user" size={18} />
        </span>
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        <button type="button" className={`${ui.btnOutline} ${ui.btnFull}`} onClick={logout} aria-disabled={busy || undefined} data-account-logout="">
          {t.logout}
        </button>
        <p className={styles.failed} role="status">
          {failed ? t.logoutFailed : ""}
        </p>
      </div>
    </div>
  );
}
