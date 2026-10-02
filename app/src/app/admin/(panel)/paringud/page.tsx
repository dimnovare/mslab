import type { Metadata } from "next";
import Link from "next/link";
import { getAdminCounts } from "@/components/admin/data";
import { adminTitle } from "@/components/admin/sections";
import { Shell } from "@/components/admin/Shell";
import { Pager } from "@/components/admin/Pager";
import { RequestToggle } from "@/components/admin/RequestToggle";
import ui from "@/components/admin/ui.module.css";
import { getDb } from "@/db/client";
import { listCourseNames, listSessionsByIds, pageRequests, type RequestKind } from "@/db/queries/admin";
import type { CourseSession, Request as RequestRow } from "@/db/schema";
import { adminEt } from "@/i18n/dict/admin";
import { pick, type I18n } from "@/i18n/field";
import { fill, formatDate, formatTime } from "@/i18n/format";
import { parsePage } from "@/domain/paging";
import { requireAdmin } from "@/server/auth";
import styles from "./requests.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: adminTitle(adminEt.nav.requests) };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// ?liik=kontakt|individuaal|praktika|ootenimekiri (A3: the waitlist has its own tab). Kontakt is the default.
// ?leht=<n>: 50 requests a page, open ones first (the order comes from the query, across pages).
const TABS = ["kontakt", "individuaal", "praktika", "ootenimekiri"] as const;
type Tab = (typeof TABS)[number];
const KIND: Record<Tab, RequestKind> = { kontakt: "contact", individuaal: "individual", praktika: "practice", ootenimekiri: "waitlist" };

type Field = keyof typeof adminEt.requests.fields;
/** The payload keys of each kind, in the order they are shown, with their label. */
const FIELDS: Record<RequestKind | "interest", [string, Field][]> = {
  contact: [["name", "name"], ["email", "email"], ["message", "message"], ["locale", "locale"]],
  interest: [["course", "course"], ["email", "email"], ["locale", "locale"]],
  individual: [
    ["name", "name"],
    ["email", "email"],
    ["phone", "phone"],
    ["course", "course"],
    ["preferredPeriod", "period"],
    ["message", "message"],
    ["wantsModelHelp", "modelHelp"],
    ["wantsAccount", "account"],
    ["locale", "locale"],
  ],
  practice: [["package", "package"], ["name", "name"], ["email", "email"], ["phone", "phone"], ["course", "completedCourse"], ["times", "times"], ["locale", "locale"]],
  waitlist: [["name", "name"], ["email", "email"], ["course", "course"], ["session", "session"], ["locale", "locale"]],
};
/** Stored for the system, not for reading. */
const HIDDEN = new Set(["courseId", "intent", "terms", "website"]);

const isInterest = (r: RequestRow) => r.kind === "contact" && r.payload.intent === "purchase";

type Lookup = { courses: Map<string, I18n>; sessions: Map<number, CourseSession> };

function value(r: RequestRow, key: string, lookup: Lookup): React.ReactNode {
  const v = r.payload[key];
  const t = adminEt.requests;
  if (typeof v === "boolean") return v ? adminEt.common.yes : adminEt.common.no;
  if (key === "email" && typeof v === "string") return <a className={ui.contactLink} href={`mailto:${v}`}>{v}</a>;
  if (key === "phone" && typeof v === "string") return <a className={ui.contactLink} href={`tel:${v.replace(/[^\d+]/g, "")}`}>{v}</a>;
  if (key === "locale") return v === "ru" ? adminEt.common.locale.ru : adminEt.common.locale.et;
  // The course of an individual / waitlist / interest request is a slug; the practice form's "course" is free text.
  if (key === "course" && r.kind !== "practice" && typeof v === "string") {
    const title = lookup.courses.get(v);
    return title ? pick(title, "et") : v;
  }
  if (key === "session") {
    const s = lookup.sessions.get(Number(v));
    return s ? `${formatDate(s.startsAt, "et")} ${formatTime(s.startsAt, "et")}, ${s.city}` : fill(t.unknownSession, { id: String(v) });
  }
  return String(v);
}

/** Requests (A3): tabs Kontakt / Individuaal / Praktika / Ootenimekiri, open ones first, "Märgi tehtuks" toggles. */
export default async function RequestsPage({ searchParams }: Props) {
  const email = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = TABS.find((x) => x === sp.liik) ?? "kontakt";
  const db = getDb();
  const [list, counts, courses] = await Promise.all([pageRequests(db, KIND[tab], parsePage(sp.leht)), getAdminCounts(), listCourseNames(db)]);
  const rows = list.rows;
  const sessionIds = tab === "ootenimekiri" ? rows.map((r) => Number(r.payload.session)).filter((n) => Number.isInteger(n) && n > 0) : [];
  const sessions = await listSessionsByIds(db, [...new Set(sessionIds)]);
  const lookup: Lookup = { courses: new Map(courses.map((c) => [c.slug, c.title])), sessions: new Map(sessions.map((s) => [s.id, s])) };
  const t = adminEt.requests;

  return (
    <Shell email={email} active="requests">
      <div className={ui.page}>
        <div className={ui.heading}>
          <div>
            <p className={ui.eyebrow}>{t.eyebrow}</p>
            <h1 className={ui.h1}>{t.title}</h1>
            <p className={ui.lead}>{t.lead}</p>
          </div>
        </div>

        <nav className={ui.filters} aria-label={t.tabsLabel} data-request-tabs="">
          {TABS.map((x) => {
            const n = counts.openRequests[KIND[x]];
            return (
              <Link key={x} className={ui.pill} href={`/admin/paringud?liik=${x}`} aria-current={x === tab ? "page" : undefined} data-tab={x}>
                {t.tabs[x]}
                {n > 0 && (
                  <span className={ui.pillCount}>
                    <span aria-hidden="true">{n}</span>
                    <span className={ui.sr}>, {fill(t.tabCount, { n })}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <h2 className={ui.sr}>{t.tabs[tab]}</h2>
        {rows.length === 0 ? (
          <section className={ui.card}>
            <p className={ui.empty}>{t.empty}</p>
          </section>
        ) : (
          <ul className={styles.list}>
            {rows.map((r) => {
              const interest = isInterest(r);
              const fields = FIELDS[interest ? "interest" : r.kind];
              const shown = new Set(fields.map(([k]) => k));
              const extra = Object.keys(r.payload).filter((k) => !shown.has(k) && !HIDDEN.has(k));
              const who = typeof r.payload.name === "string" && r.payload.name ? r.payload.name : String(r.payload.email ?? "");
              const address = typeof r.payload.email === "string" ? r.payload.email : null;
              return (
                <li key={r.id}>
                  <article className={`${ui.card} ${styles.request}`} data-request={r.id} data-handled={r.handled ? "1" : "0"} aria-labelledby={`req-${r.id}`}>
                    <header className={styles.head}>
                      <div className={styles.title}>
                        <h3 id={`req-${r.id}`} className={ui.h3}>
                          {who}
                        </h3>
                        <p className={`${ui.muted} ${ui.small}`}>{fill(t.received, { date: `${formatDate(r.createdAt, "et")} ${formatTime(r.createdAt, "et")}` })}</p>
                      </div>
                      <div className={styles.tags}>
                        {interest && <span className={`${ui.tag} ${ui.dark}`}>{t.interest}</span>}
                        <span className={`${ui.tag} ${r.handled ? ui.ok : ui.warn}`} data-request-state="">
                          {r.handled ? t.handled : t.open}
                        </span>
                      </div>
                    </header>
                    <dl className={styles.dl}>
                      {fields
                        .filter(([k]) => r.payload[k] !== undefined && r.payload[k] !== "")
                        .map(([k, label]) => (
                          <div key={k}>
                            <dt>{t.fields[label]}</dt>
                            <dd>{value(r, k, lookup)}</dd>
                          </div>
                        ))}
                      {extra.map((k) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{String(r.payload[k])}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className={styles.actions}>
                      <RequestToggle
                        id={r.id}
                        handled={r.handled}
                        t={{ markDone: t.markDone, markOpen: t.markOpen, saving: adminEt.common.saving, error: adminEt.common.saveError }}
                      />
                      {address && (
                        <a className={ui.link} href={`mailto:${address}`}>
                          {t.reply}
                        </a>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        <Pager info={list} href={(n) => `/admin/paringud?liik=${tab}${n > 1 ? `&leht=${n}` : ""}`} />
      </div>
    </Shell>
  );
}
