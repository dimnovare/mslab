import Image from "next/image";
import Link from "next/link";
import styles from "./NewsCard.module.css";

export type NewsCardData = { slug: string; href: string; title: string; excerpt: string; date: string; category: string; cover: string };

/** Prototype D `.news` card (blog list and "Loe veel"): 4:3 photo, date · category, title, excerpt, "Loe edasi ›". */
export function NewsCard({ p, readMore, level = 2 }: { p: NewsCardData; readMore: string; level?: 2 | 3 }) {
  const Title = level === 2 ? "h2" : "h3";
  return (
    <Link className={styles.card} href={p.href} data-news-card="">
      <span className={styles.photo}>
        {p.cover && <Image className={styles.image} src={p.cover} alt="" fill unoptimized sizes="(max-width: 900px) 50vw, 33vw" />}
      </span>
      <span className={styles.body}>
        <span className={styles.meta}>
          {p.date} · {p.category}
        </span>
        <Title className={styles.title}>{p.title}</Title>
        {p.excerpt && <span className={styles.excerpt}>{p.excerpt}</span>}
        <span className={styles.more} aria-hidden="true">
          {readMore}
        </span>
      </span>
    </Link>
  );
}

/** D `.grid`: three columns on desktop, two below 900px. Card titles are headings of `level`. */
export function NewsGrid({ posts, readMore, level = 2 }: { posts: NewsCardData[]; readMore: string; level?: 2 | 3 }) {
  return (
    <ul className={styles.grid}>
      {posts.map((p) => (
        <li key={p.slug}>
          <NewsCard p={p} readMore={readMore} level={level} />
        </li>
      ))}
    </ul>
  );
}
