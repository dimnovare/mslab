"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import styles from "./Lightbox.module.css";

export type LightboxImage = { src: string; alt: string };
export type LightboxTexts = { dialog: string; close: string; previous: string; next: string };

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Full-size image viewer (course gallery P2; the trainer works gallery in Task 9 reuses it).
 * A modal <dialog>: the page behind is inert, Tab stays inside, Esc closes, ←/→ (and swipe) move between images,
 * and focus returns to the element that opened it. Render it only while open; `onClose` unmounts it.
 */
export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
  t,
}: {
  images: LightboxImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  t: LightboxTexts;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const n = images.length;
  const go = (i: number) => onIndex((i + n) % n);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      root.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "Tab") {
      // Keep focus inside the dialog (the browser would otherwise move on to its own UI).
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const nextAt = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
      e.preventDefault();
      items[nextAt].focus();
    }
  };

  const image = images[index];
  if (!image) return null;
  return (
    <dialog
      ref={ref}
      className={styles.lightbox}
      aria-label={t.dialog}
      onKeyDown={onKeyDown}
      // Esc fires "cancel" first; closing goes through onClose so the parent state stays the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // click on the backdrop area
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className={styles.top}>
        <span className={styles.counter} aria-live="polite">
          {index + 1} / {n}
        </span>
        <button ref={closeRef} type="button" className={styles.round} onClick={onClose} aria-label={t.close}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <figure className={styles.figure}>
        <div className={styles.frame}>
          <Image key={image.src} className={styles.image} src={image.src} alt={image.alt} fill unoptimized sizes="100vw" />
        </div>
        {image.alt && <figcaption className={styles.caption}>{image.alt}</figcaption>}
      </figure>
      {n > 1 && (
        <>
          <button type="button" className={`${styles.round} ${styles.prev}`} onClick={() => go(index - 1)} aria-label={t.previous}>
            <Icon name="chevronLeft" size={20} />
          </button>
          <button type="button" className={`${styles.round} ${styles.next}`} onClick={() => go(index + 1)} aria-label={t.next}>
            <Icon name="chevronRight" size={20} />
          </button>
        </>
      )}
    </dialog>
  );
}
