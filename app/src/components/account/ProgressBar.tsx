import styles from "./ProgressBar.module.css";

/**
 * A thin progress bar (the e-course page's, phase 3a; shared in phase 2c with the dashboard's cards): `done` of `total`, named by the
 * element `labelledBy` points to, or by `label`. `tone`: "light" (ink on the line colour) or "dark" (paper on the ink card).
 */
export function ProgressBar({ done, total, labelledBy, label, tone = "light" }: { done: number; total: number; labelledBy?: string; label?: string; tone?: "light" | "dark" }) {
  return (
    <div
      className={styles.bar}
      data-tone={tone}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      <span style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
    </div>
  );
}
