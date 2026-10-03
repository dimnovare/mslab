import styles from "./AccountCourseCard.module.css";

/** A grey stand-in of a course card while the dashboard loads (the tag, the title, two lines and the button). */
export function CardSkeleton() {
  return (
    <div className={`${styles.card} ${styles.skeleton}`} aria-hidden="true" data-card-skeleton="">
      <span className={styles.boneTag} />
      <span className={styles.boneTitle} />
      <span className={styles.boneLine} />
      <span className={styles.boneLineShort} />
      <span className={styles.boneButton} />
    </div>
  );
}
