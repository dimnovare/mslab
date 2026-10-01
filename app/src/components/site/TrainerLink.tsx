import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./TrainerLink.module.css";

export type TrainerInfo = { name: string; role: string; text: string; portrait: string; /** close-up for the small round avatar */ avatar: string; href: string };

/** Trainer name with a small portrait, linking to the trainer page (P7). Used in the course summary card. */
export function TrainerLink({ trainer }: { trainer: TrainerInfo }) {
  return (
    <Link className={styles.link} href={trainer.href}>
      {trainer.avatar && <Image className={styles.avatar} src={trainer.avatar} alt="" width={28} height={28} unoptimized />}
      <span>{trainer.name}</span>
      <Icon name="up" size={15} />
    </Link>
  );
}

/** "Sinu koolitaja" block on the course page: portrait, name, role, first paragraph of the bio, link to /koolitaja (P7). */
export function TrainerCard({ trainer, t }: { trainer: TrainerInfo; t: { eyebrow: string; readMore: string; portraitAlt: string } }) {
  return (
    <div className={styles.card} data-trainer-card="">
      <div className={styles.photo}>
        {trainer.portrait && <Image className={styles.image} src={trainer.portrait} alt={t.portraitAlt} fill unoptimized sizes="(max-width: 640px) 100vw, 260px" />}
      </div>
      <div className={styles.body}>
        <p className={ui.caps}>{t.eyebrow}</p>
        <h2 className={styles.name}>{trainer.name}</h2>
        {trainer.role && <p className={styles.role}>{trainer.role}</p>}
        {trainer.text && <p className={styles.text}>{trainer.text}</p>}
        <Link className={ui.btnOutline} href={trainer.href}>
          {t.readMore}
          <Icon name="arrow" />
        </Link>
      </div>
    </div>
  );
}
