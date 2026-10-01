"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";
import { SlideControl } from "./SlideControl";
import ui from "./ui.module.css";
import styles from "./Hero.module.css";

export type HeroSlideView = {
  id: number;
  image: string;
  pos: string;
  posMobile: string;
  tone: "light" | "dark";
  kicker: string;
  title: string;
  text: string;
  ctaLabel: string;
  ctaHref: string;
};

export type HeroTexts = {
  caption: string;
  carousel: string;
  carouselLabel: string;
  slide: string;
  prevSlide: string;
  nextSlide: string;
  calendarLabel: string;
  calendarHref: string;
};

/** Autoplay interval (brief: 6.5 s). */
const AUTOPLAY_MS = 6500;
/** Minimum horizontal travel of a swipe, px. */
const SWIPE_PX = 40;

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const reducedMotionNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Slide titles are stored with "\n" line breaks. */
function Lines({ text }: { text: string }) {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <span key={i}>
      {line}
      {i < lines.length - 1 && <br />}
    </span>
  ));
}

/**
 * Prototype B hero (H1, H5): full-bleed under the transparent header, slides from the database, B's vertical
 * "BROW & LASH ACADEMY" (H4), primary pill + outline pill to the calendar (H3, H6) and A's slide control (H2).
 * Every slide is rendered; the current one is shown, the others are hidden and inert. The current tone is written
 * to <html data-hero-tone> for the header (G5). Autoplay 6.5 s, paused on hover, on focus and with reduced motion;
 * swipe on touch screens; arrow keys while focus is inside the hero.
 */
export function Hero({ slides, t }: { slides: HeroSlideView[]; t: HeroTexts }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);
  const tone = slides[index]?.tone ?? "light";

  // Header colour follows the slide (G5); the attribute is removed when the hero leaves the page.
  useEffect(() => {
    document.documentElement.dataset.heroTone = tone;
  }, [tone]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.heroTone;
    },
    [],
  );

  // Autoplay; restarts after every change, waits while the visitor hovers or works inside the hero.
  useEffect(() => {
    if (reduced || hovered || focused || count < 2) return;
    const timer = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, reduced, hovered, focused, count, go]);

  // No active slides: keep the page content clear of the transparent header.
  if (count === 0) return <div className={styles.empty} />;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    go(index + (e.key === "ArrowRight" ? 1 : -1));
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    touchStart.current = p ? { x: p.clientX, y: p.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    const p = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !p) return;
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <section
      className={styles.hero}
      data-hero=""
      data-tone={tone}
      aria-roledescription={t.carousel}
      aria-label={t.carouselLabel}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((s, i) => {
        const active = i === index;
        const Heading = i === 0 ? "h1" : "h2";
        return (
          <div
            key={s.id}
            className={`${styles.slide} ${active ? styles.active : ""}`}
            data-tone={s.tone}
            role="group"
            aria-roledescription={t.slide}
            aria-label={`${i + 1} / ${count}`}
            aria-hidden={active ? undefined : true}
            inert={!active}
            style={{ "--pos": s.pos, "--pos-m": s.posMobile } as React.CSSProperties}
          >
            <div className={styles.visual}>
              {s.image && (
                <Image
                  src={s.image}
                  alt=""
                  fill
                  unoptimized
                  sizes="100vw"
                  className={styles.image}
                  preload={i === 0}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "low"}
                />
              )}
            </div>
            <div className={styles.content}>
              <p className={`${ui.eyebrow} ${styles.kicker}`}>{s.kicker}</p>
              <Heading className={styles.title}>
                <Lines text={s.title} />
              </Heading>
              {s.text && <p className={styles.text}>{s.text}</p>}
              <div className={styles.actions}>
                <Link className={`${ui.btn} ${styles.primary}`} href={s.ctaHref}>
                  {s.ctaLabel}
                  <Icon name="arrow" />
                </Link>
                <Link className={`${ui.btnOutline} ${styles.secondary}`} href={t.calendarHref}>
                  {t.calendarLabel}
                  <Icon name="arrow" />
                </Link>
              </div>
            </div>
          </div>
        );
      })}

      <span className={styles.caption}>{t.caption}</span>

      <div className={styles.controls}>
        <SlideControl
          count={count}
          index={index}
          onSelect={go}
          onPrev={() => go(index - 1)}
          onNext={() => go(index + 1)}
          labels={{ group: t.carouselLabel, slide: t.slide, prev: t.prevSlide, next: t.nextSlide }}
        />
      </div>
    </section>
  );
}
