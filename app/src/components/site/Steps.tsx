import styles from "./Steps.module.css";

export type Step = { title: string; text: string };

/**
 * Numbered learning steps (D `steps()`, shared by the home formats block and the catalogue explainer).
 * Maria C12 / K5: the row is centred in its box and the dotted line runs from circle edge to circle edge through
 * the circle centres. Below 860px the list is vertical and the line runs down through the centres.
 */
export function Steps({ items, label }: { items: Step[]; label: string }) {
  return (
    <ol className={styles.steps} data-steps="" aria-label={label} style={{ "--n": items.length } as React.CSSProperties}>
      {items.map((s, i) => (
        <li key={i} className={styles.step}>
          <span className={styles.num} data-step-num="">
            {String(i + 1).padStart(2, "0")}
          </span>
          {i < items.length - 1 && <span className={styles.line} data-step-line="" aria-hidden="true" />}
          <b className={styles.title}>{s.title}</b>
          {s.text && <span className={styles.text}>{s.text}</span>}
        </li>
      ))}
    </ol>
  );
}
