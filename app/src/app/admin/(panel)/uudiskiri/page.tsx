import type { Metadata } from "next";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { getAdminCounts } from "@/components/admin/data";
import { Pager } from "@/components/admin/Pager";
import { adminTitle } from "@/components/admin/sections";
import { Shell } from "@/components/admin/Shell";
import ui from "@/components/admin/ui.module.css";
import { getDb } from "@/db/client";
import { pageSubscribers } from "@/db/queries/admin";
import { parsePage } from "@/domain/paging";
import { adminEt } from "@/i18n/dict/admin";
import { fill, formatDate, formatTime } from "@/i18n/format";
import { requireAdmin } from "@/server/auth";
import styles from "./newsletter.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: adminTitle(adminEt.nav.newsletter) };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const stamp = (d: Date) => `${formatDate(d, "et")} ${formatTime(d, "et")}`;

/**
 * Newsletter subscribers (double opt-in): e-mail, language, consent time, confirmed or not, newest first, and the CSV
 * downloads (confirmed only — the addresses a newsletter may go to — or all). 50 a page (?leht=); the CSV has all.
 */
export default async function NewsletterPage({ searchParams }: Props) {
  const email = await requireAdmin();
  const [list, counts] = await Promise.all([pageSubscribers(getDb(), parsePage((await searchParams).leht)), getAdminCounts()]);
  const rows = list.rows;
  const t = adminEt.newsletter;

  return (
    <Shell email={email} active="newsletter">
      <div className={ui.page}>
        <div className={ui.heading}>
          <div>
            <p className={ui.eyebrow}>{t.eyebrow}</p>
            <h1 className={ui.h1}>{t.title}</h1>
            <p className={ui.lead}>{t.lead}</p>
          </div>
          <div className={styles.downloads}>
            <a className={ui.btn} href="/api/admin/subscribers.csv?kinnitatud=1" download data-csv="confirmed">
              {t.csvConfirmed}
              <AdminIcon name="arrow" />
            </a>
            <a className={`${ui.btn} ${ui.secondary}`} href="/api/admin/subscribers.csv" download data-csv="all">
              {t.csvAll}
            </a>
          </div>
        </div>

        <section className={`${ui.card} ${styles.card}`} aria-label={t.title}>
          <p className={`${ui.muted} ${ui.small}`}>{fill(t.count, { n: counts.subscribers, confirmed: counts.confirmedSubscribers })}</p>
          {rows.length === 0 ? (
            <p className={ui.empty}>{t.empty}</p>
          ) : (
            <table className={`${ui.table} ${styles.table}`}>
              <thead>
                <tr>
                  <th scope="col">{t.col.email}</th>
                  <th scope="col">{t.col.locale}</th>
                  <th scope="col">{t.col.consent}</th>
                  <th scope="col">{t.col.confirmed}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-subscriber={r.id}>
                    <td data-label={t.col.email} className={styles.email}>
                      {r.email}
                    </td>
                    <td data-label={t.col.locale}>{r.locale === "ru" ? adminEt.common.locale.ru : adminEt.common.locale.et}</td>
                    <td data-label={t.col.consent} className={ui.nowrap}>
                      {stamp(r.consentAt)}
                    </td>
                    <td data-label={t.col.confirmed}>
                      {r.confirmedAt ? (
                        <span className={`${ui.tag} ${ui.ok}`}>{stamp(r.confirmedAt)}</span>
                      ) : (
                        <span className={`${ui.tag} ${ui.warn}`}>{t.pending}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager info={list} href={(n) => `/admin/uudiskiri${n > 1 ? `?leht=${n}` : ""}`} />
        </section>
      </div>
    </Shell>
  );
}
