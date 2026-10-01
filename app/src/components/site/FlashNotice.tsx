"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";
import styles from "./FlashNotice.module.css";

const noop = () => () => {};

/**
 * A short notice after a redirect (the newsletter confirmation link → /?uudiskiri=kinnitatud), fixed at the bottom of
 * the screen until closed. The text goes into the polite status region only after hydration, so screen readers
 * announce it; the query parameter is then removed from the address, so a reload or a shared link does not repeat it.
 */
export function FlashNotice({
  param,
  tone,
  title,
  text,
  closeLabel,
}: {
  param: string;
  tone: "ok" | "warn";
  title: string;
  text?: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(true);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [param]);

  return (
    <div className={styles.region} role="status" data-flash-notice={tone}>
      {hydrated && open && (
        <div className={styles.notice} data-tone={tone}>
          <span className={styles.mark} aria-hidden="true">
            <Icon name={tone === "ok" ? "check" : "close"} size={16} />
          </span>
          <p className={styles.text}>
            <b>{title}</b>
            {text && <span>{text}</span>}
          </p>
          <button type="button" className={styles.close} aria-label={closeLabel} onClick={() => setOpen(false)}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
