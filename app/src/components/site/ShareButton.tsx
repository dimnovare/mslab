"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import styles from "./CourseActions.module.css";

/**
 * "Jaga koolitust" (Maria C45 / P4): the system share sheet where the browser has one (Web Share API),
 * otherwise the course link is copied and a toast confirms it. The shared URL is the course page without query.
 */
export function ShareButton({ title, t }: { title: string; t: { label: string; copied: string } }) {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (text: string) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2600);
  };

  const share = async () => {
    const url = window.location.origin + window.location.pathname;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closing the share sheet rejects with AbortError: nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      show(t.copied);
    } catch {
      show(url); // no clipboard access: show the link so it can be copied by hand
    }
  };

  return (
    <>
      <button type="button" className={styles.action} onClick={share}>
        <Icon name="up" size={17} />
        {t.label}
      </button>
      <p className={toast ? `${styles.toast} ${styles.toastShow}` : styles.toast} role="status" data-fab-avoid="">
        {toast}
      </p>
    </>
  );
}
