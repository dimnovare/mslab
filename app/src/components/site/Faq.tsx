import ui from "./ui.module.css";
import styles from "./Faq.module.css";

/** Prototype D FAQ (Maria C30 / H14): heading left, native details/summary list right, the first one open. */
export function Faq({ eyebrow, title, items }: { eyebrow: string; title: string; items: { q: string; a: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="faq-title">
      <div className={`${ui.wrap} ${styles.faq}`}>
        <div>
          <p className={ui.caps}>{eyebrow}</p>
          <h2 id="faq-title" className={ui.h2}>
            {title}
          </h2>
        </div>
        <div className={styles.list}>
          {items.map((x, i) => (
            <details key={i} className={styles.item} open={i === 0}>
              <summary className={styles.q}>{x.q}</summary>
              <p className={styles.a}>{x.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
