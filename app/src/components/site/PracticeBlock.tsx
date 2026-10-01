import Link from "next/link";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./PracticeBlock.module.css";

export type PracticePackageView = {
  code: string;
  name: string;
  tagline: string;
  items: string[];
  /** Admin-editable approximate duration, e.g. "8 ak" (H10). */
  duration: string;
  price: string;
  href: string;
};

export type PracticeTexts = {
  eyebrow: string;
  title: string;
  slogan: string;
  text: string;
  protocolTitle: string;
  protocolText: string;
  packageLabel: string;
  durationLabel: string;
  register: string;
};

/**
 * Prototype B `practicePanel()` (dark panel, MINI / MAXI cards) with Maria's changes: "Praktika" is the big
 * heading and comes first (C08 / H11) with "Individuaalpraktika · ainult Pärnus" above it (C22); B's slogan and
 * text are secondary; each card shows the approximate duration (C07 / H10); the price is Jost 400 28px (C09 / H12).
 */
export function PracticeBlock({ t, packages }: { t: PracticeTexts; packages: PracticePackageView[] }) {
  const titleId = "practice-title";
  return (
    <section className={styles.section} data-practice="" aria-labelledby={titleId}>
      <div className={ui.wrap}>
        <div className={styles.panel}>
          <div className={styles.intro}>
            <p className={`${ui.eyebrow} ${styles.eyebrow}`}>{t.eyebrow}</p>
            <h2 id={titleId} className={styles.title}>
              {t.title}
            </h2>
            <p className={styles.slogan}>{t.slogan}</p>
            <p className={styles.text}>{t.text}</p>
            <div className={styles.protocol}>
              <h3 className={styles.protocolTitle}>{t.protocolTitle}</h3>
              <p className={styles.text}>{t.protocolText}</p>
            </div>
          </div>

          <div className={styles.options}>
            {packages.map((p) => (
              <div key={p.code} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={`${ui.eyebrow} ${styles.cardEyebrow}`}>{t.packageLabel}</span>
                  <Icon name="flower" className={styles.flower} />
                </div>
                <h3 className={styles.name}>{p.name}</h3>
                {p.tagline && <p className={styles.tagline}>{p.tagline}</p>}
                {p.items.length > 0 && (
                  <ul className={styles.items}>
                    {p.items.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                )}
                <div className={styles.priceRow}>
                  <span className={styles.price} data-price="">
                    {p.price}
                  </span>
                  {p.duration && (
                    <span className={styles.duration}>
                      <Icon name="clock" size={15} />
                      <span>
                        <span className={ui.srOnly}>{t.durationLabel}: </span>≈ {p.duration}
                      </span>
                    </span>
                  )}
                </div>
                <Link className={`${ui.btn} ${ui.btnFull}`} href={p.href}>
                  {t.register}
                  <span className={ui.srOnly}> {p.name}</span>
                  <Icon name="arrow" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
