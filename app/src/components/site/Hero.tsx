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
  pauseSlides: string;
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
const noop = () => () => {};

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

/** Is focus inside `el` and shown (keyboard focus, :focus-visible)? A pointer click focuses a button without it. */
const keyboardFocusIn = (el: HTMLElement) => {
  const active = document.activeElement;
  return !!active && el.contains(active) && active.matches(":focus-visible");
};

/**
 * Prototype B hero (H1, H5): full-bleed under the transparent header, slides from the database, B's vertical
 * "BROW & LASH ACADEMY" (H4), primary pill + outline pill to the calendar (H3, H6) and A's slide control (H2).
 * Every slide is rendered; the current one is shown, the others are hidden and inert. The current tone is written
 * to <html data-hero-tone> for the header (G5).
 *
 * Autoplay every 6.5 s; it restarts after every change, also after a click or a tap. It waits while the pointer is on
 * the controls (the slide control and the slide's buttons, so a slide never changes under a click) and while keyboard
 * focus is inside the hero, and stops for good with the pause toggle (WCAG 2.2.2) until that is pressed again; never
 * with reduced motion. Swipe on touch screens; arrow keys inside the hero.
 * A change the visitor makes is announced: the slides are a polite live region whenever autoplay is not running, and
 * from the moment a visitor presses a control, touches the hero or uses a key, so before the change happens; autoplay's
 * own changes are not announced.
 * The page loads the first slide's picture only; the next one while autoplay runs, and the rest once the browser is
 * idle (lazy, low priority), so Back, a swipe or a jump never shows an empty slide.
 */
export function Hero({ slides, t }: { slides: HeroSlideView[]; t: HeroTexts }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [onControls, setOnControls] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [paused, setPaused] = useState(false); // the pause toggle
  const [announce, setAnnounce] = useState(false); // the visitor is working the hero: their changes are announced
  const [idle, setIdle] = useState(false); // the page has loaded and the browser is idle: the other pictures may load
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set([0]));
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLElement>(null);

  const go = useCallback(
    (n: number, byVisitor: boolean) => {
      const next = ((n % count) + count) % count;
      setIndex(next);
      if (!byVisitor) setAnnounce(false);
      setShown((s) => (s.has(next) ? s : new Set(s).add(next)));
    },
    [count],
  );
  const tone = slides[index]?.tone ?? "light";
  const autoplay = !reduced && count > 1;
  const running = autoplay && !paused && !onControls && !keyboard;

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

  // Autoplay; restarts after every change, waits while the pointer is on a control or keyboard focus is in the hero,
  // stops while paused.
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => go(index + 1, false), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, running, go]);

  // The other pictures, once the page has loaded and the browser has a moment (not competing with the first one).
  useEffect(() => {
    let cancelled = false;
    let cancel: (() => void) | undefined;
    const later = () => {
      if (cancelled) return;
      const done = () => !cancelled && setIdle(true);
      if (typeof window.requestIdleCallback === "function") {
        const handle = window.requestIdleCallback(done, { timeout: 3000 });
        cancel = () => window.cancelIdleCallback(handle);
      } else {
        // Safari before 18: no idle callbacks, a short wait instead
        const handle = window.setTimeout(done, 1500);
        cancel = () => window.clearTimeout(handle);
      }
    };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", later);
      cancel?.();
    };
  }, []);

  // No active slides: keep the page content clear of the transparent header.
  if (count === 0) return <div className={styles.empty} />;

  const next = (index + 1) % count;
  const withImage = (i: number) => i === 0 || shown.has(i) || (hydrated && (idle || (autoplay && i === next)));

  const onKeyDown = (e: React.KeyboardEvent) => {
    setKeyboard(true); // working in the hero with the keyboard: wait
    setAnnounce(true);
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    go(index + (e.key === "ArrowRight" ? 1 : -1), true);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setAnnounce(true); // a swipe may follow: announce it
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
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1), true);
  };

  // The pointer is "on the controls" over the slide control or the current slide's buttons (data-hero-controls).
  const onPointerOver = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return; // touch and pen leave no hover behind
    setOnControls(!!(e.target as Element).closest("[data-hero-controls]"));
  };

  return (
    <section
      ref={root}
      className={styles.hero}
      data-hero=""
      data-tone={tone}
      data-autoplay={running ? "on" : "off"}
      aria-roledescription={t.carousel}
      aria-label={t.carouselLabel}
      onKeyDown={onKeyDown}
      onPointerOver={onPointerOver}
      onPointerDown={(e) => {
        if ((e.target as Element).closest("[data-hero-controls]")) setAnnounce(true); // before the click's change
      }}
      onPointerLeave={() => setOnControls(false)}
      onFocus={() => setKeyboard(keyboardFocusIn(root.current!))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboard(false);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.slides} aria-live={announce || !running ? "polite" : "off"} data-hero-slides="">
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
                {s.image && withImage(i) && (
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
                <div className={styles.actions} data-hero-controls="">
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
      </div>

      <span className={styles.caption}>{t.caption}</span>

      <div className={styles.controls} data-hero-controls="">
        <SlideControl
          count={count}
          index={index}
          paused={paused}
          onSelect={(i) => go(i, true)}
          onPrev={() => go(index - 1, true)}
          onNext={() => go(index + 1, true)}
          onTogglePause={() => setPaused((p) => !p)}
          labels={{ group: t.carouselLabel, slide: t.slide, prev: t.prevSlide, next: t.nextSlide, pause: t.pauseSlides }}
        />
      </div>
    </section>
  );
}
