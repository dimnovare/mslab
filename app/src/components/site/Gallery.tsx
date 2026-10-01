"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Lightbox, type LightboxImage, type LightboxTexts } from "./Lightbox";
import styles from "./Gallery.module.css";

export type GalleryTexts = LightboxTexts & { label: string; thumbs: string; prevThumbs: string; nextThumbs: string; open: string };

/**
 * Course gallery (Maria C32 / P2, prototype A): a large main image (5:4) with the small images in a carousel below
 * (4 visible on desktop, 3 on phones; arrows, swipe = native scroll with snap). Clicking the main image or a
 * thumbnail opens the lightbox at that image; the main image follows the last image viewed there.
 */
export function Gallery({ images, t }: { images: LightboxImage[]; t: GalleryTexts }) {
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [ends, setEnds] = useState({ start: true, end: true });
  const track = useRef<HTMLUListElement>(null);

  // Arrow state from the scroll position; runs on scroll and whenever the track resizes (also right after mount).
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const start = el.scrollLeft < 4;
    const end = el.scrollLeft + el.clientWidth > el.scrollWidth - 4;
    setEnds((p) => (p.start === start && p.end === end ? p : { start, end }));
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const scrollThumbs = (dir: 1 | -1) => {
    const el = track.current;
    const item = el?.firstElementChild as HTMLElement | null;
    if (!el || !item) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (item.offsetWidth + gap), behavior: reduce ? "auto" : "smooth" });
  };

  const close = () => {
    if (open !== null) setCurrent(open);
    setOpen(null);
  };

  if (images.length === 0) return <div className={styles.placeholder} aria-hidden="true" />;
  const main = images[current] ?? images[0];
  const overflow = !(ends.start && ends.end);

  return (
    <div className={styles.gallery} role="group" aria-label={t.label}>
      <button type="button" className={styles.main} data-gallery-main="" onClick={() => setOpen(current)} aria-label={`${t.open}: ${main.alt}`}>
        <Image className={styles.mainImage} src={main.src} alt="" fill preload unoptimized sizes="(max-width: 640px) 100vw, 50vw" />
      </button>

      {images.length > 1 && (
        <div className={styles.thumbs}>
          <ul ref={track} className={styles.track} data-gallery-track="" aria-label={t.thumbs}>
            {images.map((img, i) => (
              <li key={img.src + i} className={styles.item}>
                <button
                  type="button"
                  className={styles.thumb}
                  data-gallery-thumb=""
                  aria-current={i === current ? "true" : undefined}
                  aria-label={`${t.open}: ${img.alt}`}
                  onClick={() => setOpen(i)}
                >
                  <Image className={styles.thumbImage} src={img.src} alt="" fill unoptimized sizes="(max-width: 640px) 33vw, 12vw" />
                </button>
              </li>
            ))}
          </ul>
          {overflow && (
            <>
              <button type="button" className={`${styles.arrow} ${styles.arrowPrev}`} onClick={() => scrollThumbs(-1)} disabled={ends.start} aria-label={t.prevThumbs}>
                <Icon name="chevronLeft" size={18} />
              </button>
              <button type="button" className={`${styles.arrow} ${styles.arrowNext}`} onClick={() => scrollThumbs(1)} disabled={ends.end} aria-label={t.nextThumbs}>
                <Icon name="chevronRight" size={18} />
              </button>
            </>
          )}
        </div>
      )}

      {open !== null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={close} t={t} />}
    </div>
  );
}
