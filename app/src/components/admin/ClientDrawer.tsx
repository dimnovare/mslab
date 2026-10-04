import Link from "next/link";
import { tallinnToday } from "@/domain/client-access";
import { adminEt } from "@/i18n/dict/admin";
import { pick } from "@/i18n/field";
import { fill, formatDate, formatTime } from "@/i18n/format";
import { registrationHeading, type ClientDetail, type EcourseOption } from "@/server/admin-clients";
import { GrantAccessForm, RevokeAccess } from "./ClientForms";
import { StatusPill } from "./StatusPill";
import ui from "./ui.module.css";
import styles from "./ClientDrawer.module.css";

/** The Päringud tab of each request kind (/admin/paringud?liik=…). */
const REQUEST_TAB = { contact: "kontakt", individual: "individuaal", practice: "praktika", waitlist: "ootenimekiri", change_request: "muutmine" } as const;

const stamp = (d: Date) => `${formatDate(d, "et")} ${formatTime(d, "et")}`;

/**
 * One student in the Õpilased drawer: who she is and "Vaata tema vaadet" (her account page, read-only); her e-courses
 * with "Ava ligipääs" right there (the reason Maria most often opens a student) and "Lõpeta ligipääs" on each open one;
 * then her registrations (each with a link to its own drawer), her requests and the e-course terms she has accepted.
 */
export function ClientDetailView({ detail, ecourses, now }: { detail: ClientDetail; ecourses: EcourseOption[]; now: Date }) {
  const t = adminEt.clients.drawer;
  const g = adminEt.clients.grant;
  const r = adminEt.clients.revoke;
  const c = detail.client;
  const open = new Set(detail.access.filter((a) => a.state === "active").map((a) => a.courseId));
  // the first e-course she cannot open now: the likeliest one to grant
  const first = ecourses.find((e) => !open.has(e.id)) ?? ecourses[0];

  return (
    <div className={styles.detail} data-client-detail={c.id}>
      <div className={styles.head}>
        <h2 className={ui.h2}>{c.name || t.noName}</h2>
        <p className={styles.meta}>
          <a className={ui.contactLink} href={`mailto:${c.email}`}>
            {c.email}
          </a>
          {c.phone && (
            <a className={ui.contactLink} href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
              {c.phone}
            </a>
          )}
        </p>
        <p className={`${ui.muted} ${ui.small}`}>
          {fill(t.created, { date: formatDate(c.createdAt, "et") })} · {t.locale} {c.locale === "ru" ? adminEt.common.locale.ru : adminEt.common.locale.et}
        </p>
        <Link className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`} href={`/admin/opilased/${c.id}/vaade`} data-view-as="">
          {t.viewAs}
        </Link>
      </div>

      <section className={styles.section} aria-labelledby={`client-${c.id}-access`} data-client-access="">
        <h3 id={`client-${c.id}-access`} className={ui.h3}>
          {t.access}
        </h3>
        {detail.access.length === 0 ? (
          <p className={styles.none}>{t.noAccess}</p>
        ) : (
          <ul className={styles.rows}>
            {detail.access.map((a) => {
              const title = pick(a.title, "et");
              const until = formatDate(a.state === "revoked" && a.revokedAt ? a.revokedAt : a.expiresAt, "et");
              return (
                <li key={a.id} className={styles.row} data-access={a.courseId} data-access-state={a.state}>
                  <div className={styles.rowHead}>
                    <strong>{title}</strong>
                    <span id={`access-${a.id}-state`} tabIndex={-1} className={`${ui.tag} ${a.state === "active" ? ui.ok : a.state === "revoked" ? ui.bad : ""}`}>
                      {fill(t.state[a.state], { date: until })}
                    </span>
                  </div>
                  <p className={styles.meta}>{fill(t.grantedBy, { who: a.grantedBy, date: stamp(a.grantedAt) })}</p>
                  <RevokeAccess
                    clientId={c.id}
                    accessId={a.id}
                    course={title}
                    active={a.state === "active"}
                    stateId={`access-${a.id}-state`}
                    t={{ ...r, saving: adminEt.common.saving, error: adminEt.common.saveError }}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {first ? (
          <GrantAccessForm
            clientId={c.id}
            courses={ecourses.map((e) => ({ id: e.id, label: e.published ? pick(e.title, "et") : `${pick(e.title, "et")} (${g.draft})`, until: e.until }))}
            initialCourseId={first.id}
            today={tallinnToday(now)}
            t={{ ...g, saving: adminEt.common.saving, error: adminEt.common.saveError }}
          />
        ) : (
          <p className={ui.notice}>{g.noCourses}</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby={`client-${c.id}-regs`} data-client-registrations="">
        <h3 id={`client-${c.id}-regs`} className={ui.h3}>
          {t.registrations}
        </h3>
        {detail.registrations.length === 0 ? (
          <p className={styles.none}>{t.noRegistrations}</p>
        ) : (
          <ul className={styles.rows}>
            {detail.registrations.map((reg) => {
              const h = registrationHeading(reg);
              return (
                <li key={reg.id} className={styles.row} data-client-registration={reg.id}>
                  <div className={styles.rowHead}>
                    <strong>{h.title}</strong>
                    <StatusPill status={reg.status} />
                  </div>
                  {(h.time || h.place) && <p className={styles.meta}>{[h.time, h.place].filter(Boolean).join(", ")}</p>}
                  <Link className={ui.link} href={`/admin/registreerimised?id=${reg.id}`}>
                    {t.openRegistration}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby={`client-${c.id}-reqs`} data-client-requests="">
        <h3 id={`client-${c.id}-reqs`} className={ui.h3}>
          {t.requests}
        </h3>
        {detail.requests.length === 0 ? (
          <p className={styles.none}>{t.noRequests}</p>
        ) : (
          <ul className={styles.rows}>
            {detail.requests.map((q) => (
              <li key={q.id} className={styles.row} data-client-request={q.id}>
                <div className={styles.rowHead}>
                  <strong>{q.wish ? adminEt.requests.wish[q.wish] : adminEt.requests.tabs[REQUEST_TAB[q.kind]]}</strong>
                  <span className={`${ui.tag} ${q.handled ? ui.ok : ui.warn}`}>{q.handled ? adminEt.requests.handled : adminEt.requests.open}</span>
                </div>
                <p className={styles.meta}>{fill(adminEt.requests.received, { date: stamp(q.createdAt) })}</p>
                <Link className={ui.link} href={`/admin/paringud?liik=${REQUEST_TAB[q.kind]}`}>
                  {t.openRequests}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby={`client-${c.id}-terms`} data-client-terms="">
        <h3 id={`client-${c.id}-terms`} className={ui.h3}>
          {t.terms}
        </h3>
        {detail.terms.length === 0 ? (
          <p className={styles.none}>{t.noTerms}</p>
        ) : (
          <ul className={styles.rows}>
            {detail.terms.map((a, i) => (
              <li key={i} className={styles.row}>
                <div className={styles.rowHead}>
                  <strong>{pick(a.courseTitle, "et")}</strong>
                </div>
                <p className={styles.meta}>{fill(t.accepted, { date: stamp(a.acceptedAt) })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
