"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CAMPAIGN_SEEN_KEY, campaignDelay, type CampaignView } from "@/domain/campaign";
import type { Locale } from "@/i18n/locales";
import { lockPageScroll, trapTab } from "@/lib/modal";
import { CampaignCard } from "./CampaignCard";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./CampaignPopup.module.css";

export type CampaignPopupTexts = { close: string; copy: string; copied: string; selected: string };

declare global {
  interface Window {
    /** e2e only (tests/e2e/test.ts): a shorter delay than D's 6 s, in ms. */
    __mslabCampaignDelay?: number;
  }
}

/** How far a finger pulls the sheet down before letting go closes it. */
const SWIPE_CLOSE_PX = 80;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Shown during this page load already. The module lives as long as the document, through client-side moves (home →
 * course → home remounts the popup), so this keeps "once" when sessionStorage is refused; a new page load starts over.
 */
let shownThisLoad = false;

/**
 * The campaign popup (prototype D `campHtml` / `maybeAutoCampaign`, Maria C37: "Sellise kampaania lahendus mulle
 * meeldib"). Rendered by the home page only (/ and /ru), so no other page ever shows it. 6 s after the page appears it
 * opens once per browser session: sessionStorage "mslab-camp" is set when it is shown. When the browser refuses
 * storage it is shown at most once per page load (shownThisLoad), also across client-side moves back to the home page.
 * It waits while another modal (the phone menu, a lightbox) is open.
 */
export function CampaignPopup({ c, locale, t }: { c: CampaignView; locale: Locale; t: CampaignPopupTexts }) {
  const [open, setOpen] = useState(false);
  const image = c.image;

  useEffect(() => {
    if (shownThisLoad) return;
    try {
      if (sessionStorage.getItem(CAMPAIGN_SEEN_KEY) === "1") return;
    } catch {
      // no storage: this page load may still show it once
    }
    // Fetch the picture while waiting, so the card opens with it.
    if (image) new Image().src = image;
    let timer = window.setTimeout(function show() {
      if (document.querySelector("dialog[open]")) {
        timer = window.setTimeout(show, 1000);
        return;
      }
      shownThisLoad = true;
      try {
        sessionStorage.setItem(CAMPAIGN_SEEN_KEY, "1");
      } catch {
        // shown anyway: shownThisLoad keeps it to once for this page load
      }
      setOpen(true);
    }, campaignDelay(window.__mslabCampaignDelay));
    return () => window.clearTimeout(timer);
  }, [image]);

  const close = useCallback(() => setOpen(false), []);
  return open ? <CampaignDialog c={c} locale={locale} t={t} onClose={close} /> : null;
}

/**
 * The open popup: a modal <dialog> over a dimmed, blurred page (D .camp-bd) holding the CampaignCard, with ✕ in its
 * corner and the copy button by the code. No "Mitte praegu" (M3). Focus moves to ✕, Tab stays inside, the page behind
 * does not scroll; Esc, ✕ and the backdrop close it and give the focus back; the button closes it on its way to the
 * course. Under 640px it is D's bottom sheet, which also closes when pulled down; with reduced motion nothing slides.
 */
function CampaignDialog({ c, locale, t, onClose }: { c: CampaignView; locale: Locale; t: CampaignPopupTexts; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(true);
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

  // Open as a modal, lock the page, focus ✕; on close unlock and give the focus back.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const unlock = lockPageScroll();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-campaign-close]")?.focus();
    // D: the backdrop fades in and the card rises (CSS transitions from the closed state; none with reduced motion)
    const frame = requestAnimationFrame(() => dialog.setAttribute("data-on", ""));
    return () => {
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
      unlock();
      if (returnFocus.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // A downward swipe on the sheet closes it: the sheet follows the finger (not with reduced motion) and closes when let
  // go far enough down, otherwise it springs back. Only from the top of the sheet's own scroll and only downwards, so
  // scrolling a tall card still works. A non-passive listener, so the page does not scroll (or refresh) meanwhile.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let dy = 0;
    const reset = () => {
      panel.removeAttribute("data-dragging");
      panel.style.transform = "";
    };
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 && panel.scrollTop <= 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      dragging = false;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const ddx = e.touches[0].clientX - start.x;
      const ddy = e.touches[0].clientY - start.y;
      if (!dragging) {
        if (ddy <= 0 || Math.abs(ddx) > ddy) {
          start = null; // up or sideways: the card's own scrolling
          return;
        }
        dragging = true;
        panel.setAttribute("data-dragging", "");
      }
      if (e.cancelable) e.preventDefault();
      dy = Math.max(0, ddy);
      if (!reducedMotion()) panel.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      const wasDragging = dragging;
      start = null;
      dragging = false;
      if (!wasDragging) return;
      if (e.type === "touchend" && dy >= SWIPE_CLOSE_PX) onClose();
      else reset();
    };
    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [onClose]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(c.code);
      setCopied(true);
      setStatus(t.copied);
    } catch {
      // No clipboard (an old browser, an insecure page, a refusal): select the code for the visitor to copy.
      const code = ref.current?.querySelector("[data-campaign-code]");
      const selection = window.getSelection();
      if (code && selection) selection.selectAllChildren(code);
      setStatus(t.selected);
    }
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-campaign-popup=""
      onKeyDown={(e) => trapTab(e, ref.current)} // Tab stays inside
      // Esc fires "cancel": closing goes through onClose, so the popup's state stays the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Closed by the browser itself: follow. The event comes a moment later, so a dialog opened again meanwhile (React's
      // development re-run of the effect) is not closed by an old close.
      onClose={(e) => {
        if (!e.currentTarget.open) onClose();
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.hasAttribute("data-campaign-backdrop")) onClose();
        else if (target.closest("a[href]")) {
          // A ctrl/cmd-, shift- or alt-click (or any but the main button) opens the course elsewhere: this page stays,
          // and so do the popup and its focus.
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          // the button: on to the course; the focus belongs to the next page, not back to this one
          returnFocus.current = false;
          onClose();
        }
      }}
    >
      <div className={styles.backdrop} data-campaign-backdrop="" aria-hidden="true" />
      <div ref={panelRef} className={styles.panel} data-campaign-panel="" data-fab-avoid="">
        <CampaignCard
          c={c}
          locale={locale}
          titleId={titleId}
          close={
            <button type="button" className={styles.close} aria-label={t.close} onClick={onClose} data-campaign-close="">
              <Icon name="close" size={20} />
            </button>
          }
          codeAction={
            <button type="button" onClick={copy} data-campaign-copy="">
              {copied ? t.copied : t.copy}
            </button>
          }
        />
      </div>
      <p className={ui.srOnly} role="status">
        {status}
      </p>
    </dialog>
  );
}
