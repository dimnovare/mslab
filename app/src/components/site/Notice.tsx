import Link from "next/link";
import { Icon } from "./Icon";
import styles from "./Notice.module.css";

/** A short full-width message page inside the site shell (account placeholder, 404). */
export function Notice({ title, text, links }: { title: string; text?: string; links: { href: string; label: string }[] }) {
  return (
    <section className={styles.notice}>
      <h1 className={styles.title}>{title}</h1>
      {text && <p className={styles.text}>{text}</p>}
      <div className={styles.links}>
        {links.map((l) => (
          <Link key={l.href} className={styles.link} href={l.href}>
            {l.label}
            <Icon name="arrow" />
          </Link>
        ))}
      </div>
    </section>
  );
}
