"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/site/Icon";
import ui from "@/components/site/ui.module.css";
import modal from "@/components/ui/modal.module.css";
import { cardTitle, cardWhen, type ContactCard } from "@/domain/account-cards";
import type { Locale } from "@/i18n/locales";
import { lockPageScroll, trapTab } from "@/lib/modal";
import type { CoursesTexts } from "./texts";
import styles from "./ChangeRequestDialog.module.css";

/** The longest message the API takes (server/account-input.ts). */
const MESSAGE_MAX = 1000;

export type ChangeRequestEnd =
  /** stored for Maria: the card says "Saadetud" */
  | "sent"
  /** closed without sending */
  | "closed"
  /** the registration can no longer be changed (404), or the session ended (401): the dashboard is loaded again */
  | "stale";

type Kind = "cancel" | "change";

/**
 * "Tühista või muuda aega" for one registration: the site's modal dialog (the campaign popup's pattern — a native modal
 * <dialog>, Tab kept inside, the page behind still, Esc / ✕ / the backdrop close it, the focus back on the card's button;
 * a bottom sheet on phones). Two big choices, "Soovin tühistada" / "Soovin muuta aega", an optional message and one
 * "Saada" → POST /api/konto/muutmine. Nothing changes on the registration: Maria gets the request in her inbox.
 * Failures are one plain sentence: the registration cannot be changed any more (404), too many requests (429), or
 * anything else ("Proovi uuesti").
 */
export function ChangeRequestDialog({
  card,
  opener,
  locale,
  t,
  onEnd,
}: {
  card: ContactCard;
  opener: HTMLElement | null;
  locale: Locale;
  t: CoursesTexts;
  onEnd(end: ChangeRequestEnd): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(true);
  const stale = useRef(false);
  const titleId = useId();
  const messageId = useId();
  const [kind, setKind] = useState<Kind | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const r = t.request;
  const when = cardWhen(card, locale);

  // Open as a modal, keep the page still, focus the first choice; on close unlock and give the focus back to the opener.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const unlock = lockPageScroll();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("input[type='radio']")?.focus();
    const frame = requestAnimationFrame(() => dialog.setAttribute("data-on", ""));
    return () => {
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
      unlock();
      if (returnFocus.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  const close = () => onEnd(stale.current ? "stale" : "closed");

  const send = async () => {
    if (busy) return;
    if (!kind) {
      setNotice({ text: r.pick, error: false });
      ref.current?.querySelector<HTMLElement>("input[type='radio']")?.focus();
      return;
    }
    setBusy(true);
    setNotice(null);
    let res: Response;
    try {
      res = await fetch("/api/konto/muutmine", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ registrationId: card.registrationId, kind, message: message.trim().slice(0, MESSAGE_MAX) }),
      });
    } catch {
      setBusy(false);
      setNotice({ text: r.failed, error: true });
      return;
    }
    if (res.ok) {
      returnFocus.current = false; // the card's button gives way to "Saadetud", which takes the focus
      onEnd("sent");
      return;
    }
    if (res.status === 401) {
      // signed out meanwhile (another device, 180 days): the dashboard is loaded again and says so
      returnFocus.current = false;
      onEnd("stale");
      return;
    }
    setBusy(false);
    if (res.status === 404) stale.current = true; // closing loads the dashboard again: the card shows what is true now
    setNotice({ text: res.status === 404 ? r.notAllowed : res.status === 429 ? r.rate : r.failed, error: true });
  };

  return (
    <dialog
      ref={ref}
      className={modal.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-change-dialog=""
      onKeyDown={(e) => trapTab(e, ref.current)}
      // Esc fires "cancel": closing goes through onEnd, so the dashboard's state stays the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={(e) => {
        if (!e.currentTarget.open) close();
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).hasAttribute("data-change-backdrop")) close();
      }}
    >
      <div className={modal.backdrop} data-change-backdrop="" aria-hidden="true" />
      <div className={`${modal.panel} ${styles.panel}`} data-fab-avoid="">
        <button type="button" className={modal.close} aria-label={r.close} onClick={close}>
          <Icon name="close" size={20} />
        </button>
        <h2 id={titleId} className={styles.title}>
          {cardTitle(card, locale, t.untitled)}
        </h2>
        {when && (
          <p className={styles.when}>
            {when.time}
            {when.place && `, ${when.place}`}
          </p>
        )}
        <form
          className={styles.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <fieldset className={styles.choices}>
            <legend className={styles.question}>{r.question}</legend>
            {(["cancel", "change"] as const).map((value) => (
              <label key={value} className={styles.choice}>
                <input
                  type="radio"
                  name="change-kind"
                  value={value}
                  checked={kind === value}
                  onChange={() => {
                    setKind(value);
                    setNotice(null);
                  }}
                  data-change-kind={value}
                />
                <span>{value === "cancel" ? r.cancel : r.change}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.label} htmlFor={messageId}>
            {r.message}
          </label>
          <textarea id={messageId} className={styles.message} rows={3} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className={notice?.error ? styles.error : styles.note} role="status" data-change-notice="">
            {notice?.text ?? ""}
          </p>
          <button type="submit" className={`${ui.btn} ${ui.btnFull}`} aria-disabled={busy || undefined} data-change-send="">
            {r.send}
          </button>
        </form>
      </div>
    </dialog>
  );
}
