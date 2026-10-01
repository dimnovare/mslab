"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./BlogCarousel.module.css";

export type BlogCard = { slug: string; href: string; title: string; excerpt: string; date: string; category: string; cover: string };

/**
 * Prototype D dark blog panel (`blogp` + `newsDark`, H16): heading, a scroll-snap row of cards that open the full
 * post, "Kõik postitused" and previous / next buttons (disabled at the ends).
 */
export function BlogCarousel({
  t,
  posts,
  allHref,
}: {
  t: { eyebrow: string; title: string; lead: string; all: string; carouselLabel: string; prev: string; next: string };
  posts: BlogCard[];
  allHref: string;
}) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 18 : 300;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: smooth ? "smooth" : "auto" });
  };

  if (posts.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={ui.wrap}>
        <div className={styles.panel}>
          <div className={styles.head}>
            <div>
              <p className={`${ui.caps} ${styles.eyebrow}`}>{t.eyebrow}</p>
              <h2 id={`${id}-title`} className={ui.h2}>
                {t.title}
              </h2>
            </div>
            <p className={styles.lead}>{t.lead}</p>
          </div>
          <div className={styles.rule} />
          <div ref={track} className={styles.track} tabIndex={0} role="group" aria-label={t.carouselLabel}>
            {posts.map((p) => (
              <Link key={p.slug} className={styles.card} href={p.href}>
                <span className={styles.photo}>
                  {p.cover && <Image className={styles.image} src={p.cover} alt="" fill unoptimized sizes="(max-width: 640px) 80vw, 340px" />}
                </span>
                <div className={styles.body}>
                  <span className={styles.meta}>
                    {p.date} · {p.category}
                  </span>
                  <h3 className={styles.title}>{p.title}</h3>
                  <span className={styles.excerpt}>{p.excerpt}</span>
                </div>
              </Link>
            ))}
          </div>
          <div className={styles.foot}>
            <Link className={ui.more} href={allHref}>
              {t.all}
            </Link>
            <div className={styles.buttons}>
              <button type="button" aria-label={t.prev} disabled={edges.start} onClick={() => scroll(-1)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              <button type="button" aria-label={t.next} disabled={edges.end} onClick={() => scroll(1)}>
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
