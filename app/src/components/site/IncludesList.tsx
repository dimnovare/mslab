import { Icon } from "./Icon";
import styles from "./CourseLists.module.css";

/** "Koolitus sisaldab" (P8, P10): a check list. Contact courses use Maria's eight items from the course's `includes`. */
export function IncludesList({ items }: { items: string[] }) {
  return (
    <ul className={styles.includes} data-includes="">
      {items.map((x) => (
        <li key={x}>
          <span className={styles.tick} aria-hidden="true">
            <Icon name="check" size={13} />
          </span>
          {x}
        </li>
      ))}
    </ul>
  );
}
