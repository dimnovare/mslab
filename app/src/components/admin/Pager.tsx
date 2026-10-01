import Link from "next/link";
import type { PageInfo } from "@/domain/paging";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import ui from "./ui.module.css";
import styles from "./Pager.module.css";

/** "← Eelmine · Lehekülg 2 / 5 · Järgmine →" under a long admin list; nothing when everything fits on one page. */
export function Pager({ info, href }: { info: PageInfo; href: (page: number) => string }) {
  if (info.pages <= 1) return null;
  const t = adminEt.pager;
  return (
    <nav className={styles.pager} aria-label={t.label} data-pager="">
      {info.page > 1 ? (
        <Link className={`${ui.pill} ${ui.pillSmall}`} href={href(info.page - 1)} rel="prev">
          <span aria-hidden="true">←</span> {t.prev}
        </Link>
      ) : (
        <span />
      )}
      <span className={styles.where}>
        {fill(t.page, { page: info.page, pages: info.pages })}
      </span>
      {info.page < info.pages ? (
        <Link className={`${ui.pill} ${ui.pillSmall}`} href={href(info.page + 1)} rel="next">
          {t.next} <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
