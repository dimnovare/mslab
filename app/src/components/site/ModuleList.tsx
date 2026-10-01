import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./CourseLists.module.css";

/**
 * Numbered module / programme list (D .prog). E-learning modules are all visible but locked in the shop view
 * (Maria: "kõik koolituse moodulid on nähtavad, kuid poevaates neid avada ei saa", P8): plain text with a lock, no links.
 */
export function ModuleList({ items, locked, lockedLabel }: { items: string[]; locked?: boolean; lockedLabel: string }) {
  return (
    <ol className={styles.modules} data-modules="">
      {items.map((x, i) => (
        <li key={i}>
          <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
          <span className={styles.moduleTitle}>{x}</span>
          {locked && (
            <span className={styles.lock} data-locked="">
              <Icon name="lock" size={17} />
              <span className={ui.srOnly}>{lockedLabel}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
