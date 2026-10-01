import { CourseCard, type CourseCardData } from "./CourseCard";
import ui from "./ui.module.css";
import styles from "./Recommendations.module.css";

/** "Sulle võiksid huvi pakkuda" at the very bottom of a course page (Maria C46 / P5), B section heading and cards. */
export function Recommendations({ title, cards }: { title: string; cards: CourseCardData[] }) {
  if (cards.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="recommendations-title" data-recommendations="">
      <div className={ui.wrap}>
        <h2 id="recommendations-title" className={styles.title}>
          {title}
        </h2>
        <div className={styles.grid}>
          {cards.map((c) => (
            <CourseCard key={c.id} c={c} square sizes="(max-width: 640px) 100vw, (max-width: 1180px) 50vw, 33vw" />
          ))}
        </div>
      </div>
    </section>
  );
}
