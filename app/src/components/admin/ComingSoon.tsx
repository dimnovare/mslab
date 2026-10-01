import Link from "next/link";
import { adminEt } from "@/i18n/dict/admin";
import ui from "./ui.module.css";
import styles from "./ComingSoon.module.css";

/** A menu section whose editor is not built yet: its title and a short "Tulekul" note. */
export function ComingSoon({ title }: { title: string }) {
  const t = adminEt.soon;
  return (
    <div className={ui.page}>
      <div className={ui.heading}>
        <h1 className={ui.h1}>{title}</h1>
      </div>
      <section className={`${ui.card} ${styles.card}`} data-coming-soon="">
        <span className={`${ui.tag} ${ui.warn}`}>{t.tag}</span>
        <h2 className={ui.h2}>{t.title}</h2>
        <p className={ui.muted}>{t.text}</p>
        <Link className={ui.link} href="/admin">
          {t.back}
        </Link>
      </section>
    </div>
  );
}
