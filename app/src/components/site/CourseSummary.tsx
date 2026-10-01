import styles from "./CourseSummary.module.css";

export type SummaryItem = { label: string; value: React.ReactNode; /** takes two columns (the trainer link) */ wide?: boolean };

/**
 * The right-column summary card (Maria's browmaniac example, P3): the key facts at a glance —
 * e-learning: modules, videos, access, language, trainer; contact: duration, language, trainer, cities.
 * A next-course discount, when set, is a highlighted line at the bottom.
 */
export function CourseSummary({ items, discount }: { items: SummaryItem[]; discount?: SummaryItem }) {
  return (
    <div className={styles.summary} data-course-summary="">
      <dl className={styles.list}>
        {items.map((it) => (
          <div key={it.label} className={it.wide ? `${styles.item} ${styles.wide}` : styles.item}>
            <dt className={styles.label}>{it.label}</dt>
            <dd className={styles.value}>{it.value}</dd>
          </div>
        ))}
      </dl>
      {discount && (
        <p className={styles.discount}>
          <span className={styles.discountLabel}>{discount.label}</span>
          <span className={styles.discountValue}>{discount.value}</span>
        </p>
      )}
    </div>
  );
}
