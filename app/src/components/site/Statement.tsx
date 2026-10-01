import { splitStatement } from "@/domain/home";
import ui from "./ui.module.css";
import styles from "./Statement.module.css";

/** Prototype D statement line (Maria C25 / H8): kept, in smaller type. Text from the "statement" page. */
export function Statement({ eyebrow, text }: { eyebrow: string; text: string }) {
  const [lead, rest] = splitStatement(text);
  if (!lead) return null;
  return (
    <section className={styles.stmt}>
      <div className={ui.wrap}>
        <p className={`${ui.caps} ${styles.eyebrow}`}>{eyebrow}</p>
        <p className={styles.statement}>
          {lead}
          {rest && <span>{rest}</span>}
        </p>
      </div>
    </section>
  );
}
