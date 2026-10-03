import card from "./AccountCourseCard.module.css";
import styles from "./Skeleton.module.css";

/** A grey stand-in of a course card while the dashboard loads (the tag, the title, two lines and the button). */
export function CardSkeleton() {
  return (
    <div className={card.card} aria-hidden="true" data-card-skeleton="">
      <span className={`${styles.bone} ${styles.tag}`} />
      <span className={`${styles.bone} ${styles.cardTitle}`} />
      <span className={`${styles.bone} ${styles.line}`} />
      <span className={`${styles.bone} ${styles.lineShort}`} />
      <span className={`${styles.bone} ${styles.button}`} />
    </div>
  );
}

/** The greeting's stand-in: the heading and the line under it. */
export function GreetingSkeleton() {
  return (
    <>
      <span className={`${styles.bone} ${styles.title}`} aria-hidden="true" />
      <span className={`${styles.bone} ${styles.lead}`} aria-hidden="true" />
    </>
  );
}
