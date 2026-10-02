import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./TrainerTeaser.module.css";

export type TrainerTeaserData = {
  eyebrow: string;
  name: string;
  text: string;
  portrait: string;
  /** The focal point (CSS object-position) and whether to zoom in (the seed portrait only). */
  portraitPos: string;
  portraitZoom: boolean;
  portraitAlt: string;
  stats: { value: string; label: string }[];
  link: { label: string; href: string };
};

/** Prototype D "Sinu koolitaja" block (Maria C26, C27 / H9): portrait, name, short text, stats, link to /koolitaja. */
export function TrainerTeaser({ d }: { d: TrainerTeaserData }) {
  if (!d.name) return null;
  return (
    <section className={styles.section} data-trainer-teaser="">
      <div className={ui.wrap}>
        <div className={styles.trainer}>
          <div className={styles.photo}>
            {d.portrait && (
              <Image
                className={`${styles.image} ${d.portraitZoom ? styles.seedZoom : ""}`}
                style={{ objectPosition: d.portraitPos }}
                src={d.portrait}
                alt={d.portraitAlt}
                fill
                unoptimized
                sizes="(max-width: 860px) 100vw, 50vw"
              />
            )}
          </div>
          <div className={styles.text}>
            <p className={ui.caps}>{d.eyebrow}</p>
            <h2 className={ui.h2}>{d.name}</h2>
            {d.text && <p className={ui.lead}>{d.text}</p>}
            {d.stats.length > 0 && (
              <dl className={styles.stats}>
                {d.stats.map((s) => (
                  <div key={s.value + s.label}>
                    <dt className={styles.statValue}>{s.value}</dt>
                    <dd className={styles.statLabel}>{s.label}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div>
              <Link className={ui.btnOutline} href={d.link.href}>
                {d.link.label}
                <Icon name="arrow" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
