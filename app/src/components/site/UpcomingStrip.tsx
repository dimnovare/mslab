import Link from "next/link";
import ui from "./ui.module.css";
import styles from "./UpcomingStrip.module.css";

export type UpcomingItem = { id: number; href: string; day: string; weekday: string; title: string; city: string; format: string; language: string };

/** Prototype D `.upc` strip under the hero: the next sessions with date, course name and city. */
export function UpcomingStrip({ label, items }: { label: string; items: UpcomingItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.upc} aria-label={label}>
      <div className={`${ui.wrap} ${styles.row}`}>
        {items.map((s) => (
          <Link key={s.id} className={styles.item} href={s.href}>
            <span className={styles.date}>
              {s.day}
              <small>{s.weekday}</small>
            </span>
            <span className={styles.title}>{s.title}</span>
            <span className={styles.meta}>
              <b>{s.city}</b> · {s.format} · {s.language}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
