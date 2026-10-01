import { Icon } from "./Icon";
import styles from "./SlideControl.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Prototype A's hero control (Maria C03 / H2): mono "01 / 05" counter, a bar of 2px segments (current at full
 * opacity, the others at .25), a round outline "previous" and a filled "next" button, all in the hero's text colour.
 */
export function SlideControl({
  count,
  index,
  onSelect,
  onPrev,
  onNext,
  labels,
}: {
  count: number;
  index: number;
  onSelect: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
  labels: { group: string; slide: string; prev: string; next: string };
}) {
  return (
    <div className={styles.control} role="group" aria-label={labels.group}>
      <span className={styles.count}>{`${pad(index + 1)} / ${pad(count)}`}</span>
      <div className={styles.segments} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            className={styles.segment}
            aria-label={`${labels.slide} ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => onSelect(i)}
          />
        ))}
      </div>
      <div className={styles.buttons}>
        <button type="button" className={styles.prev} aria-label={labels.prev} onClick={onPrev}>
          <Icon name="chevronLeft" size={18} />
        </button>
        <button type="button" className={styles.next} aria-label={labels.next} onClick={onNext}>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    </div>
  );
}
