"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import styles from "./FlashNotice.module.css";

export type FlashMessage = { tone: "ok" | "warn"; title: string; text?: string };

/**
 * A short notice after a redirect, fixed at the bottom of the screen until closed: the newsletter confirmation link →
 * /?uudiskiri=kinnitatud, and an account page that sends the visitor here with a fragment (/#konto-kustutatud after the
 * account was deleted: lib/account-marks.ts). The page is cached and shared by every visitor, so the server renders only the
 * empty polite status region; the browser reads the address after hydration, puts the matching text into the region (so
 * screen readers announce it) and removes the parameter or the fragment from the address, so a reload or a shared link does
 * not repeat it. `notices`: the text for each value of the query parameter `param`; `fragments`: the text for each whole
 * fragment; anything else shows nothing and is left alone.
 */
export function FlashNotice({
  param,
  notices,
  fragments = {},
  closeLabel,
}: {
  param: string;
  notices: Record<string, FlashMessage>;
  fragments?: Record<string, FlashMessage>;
  closeLabel: string;
}) {
  const [shown, setShown] = useState<FlashMessage | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(param);
    const mark = url.hash.slice(1);
    let notice: FlashMessage | null;
    if (value !== null) {
      url.searchParams.delete(param);
      notice = Object.hasOwn(notices, value) ? notices[value] : null;
    } else if (mark && Object.hasOwn(fragments, mark)) {
      url.hash = "";
      notice = fragments[mark];
    } else return;
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser, after hydration
    if (notice) setShown(notice);
  }, [param, notices, fragments]);

  return (
    <div className={styles.region} role="status" data-flash-notice={shown?.tone ?? ""}>
      {shown && (
        <div className={styles.notice} data-tone={shown.tone} data-fab-avoid="">
          <span className={styles.mark} aria-hidden="true">
            <Icon name={shown.tone === "ok" ? "check" : "close"} size={16} />
          </span>
          <p className={styles.text}>
            <b>{shown.title}</b>
            {shown.text && <span>{shown.text}</span>}
          </p>
          <button type="button" className={styles.close} aria-label={closeLabel} onClick={() => setShown(null)}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
