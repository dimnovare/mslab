import { ModuleList } from "@/components/site/ModuleList";
import ui from "@/components/site/ui.module.css";
import { fill, formatDate } from "@/i18n/format";
import { pick } from "@/i18n/field";
import type { Locale } from "@/i18n/locales";
import type { EcourseView as EcourseData } from "@/server/client-data";
import type { EcourseTexts } from "./texts";
import page from "./EcoursePage.module.css";
import styles from "./EcourseView.module.css";

/** A ref that focuses its element once, when it appears (stable, so a later render does not focus it again). */
const focusOnMount = (el: HTMLElement | null) => el?.focus();

/**
 * The e-course the client has access to, once the terms are accepted: the title, "Ligipääs kuni {date}" (Estonian time, as on the
 * dashboard's card), the module list with the same locked marks as the public course page, and "Sisu lisandub peagi." — nothing
 * else (the lessons come in a later phase). `focusHeading`: the notice has just been accepted, so the title takes the focus.
 */
export function EcourseView({ data, locale, t, focusHeading = false }: { data: EcourseData; locale: Locale; t: EcourseTexts; focusHeading?: boolean }) {
  const modules = data.course.modules.map((m) => pick(m.title, locale));
  return (
    <div className={`${ui.wrap} ${page.page}`} data-ecourse="">
      <h1 ref={focusHeading ? focusOnMount : undefined} className={page.title} tabIndex={-1}>
        {pick(data.course.title, locale)}
      </h1>
      <p className={styles.access} data-ecourse-access="">
        {fill(t.access, { date: formatDate(new Date(data.access.expiresAt), locale) })}
      </p>
      {modules.length > 0 && (
        <div className={styles.modules}>
          <ModuleList items={modules} locked lockedLabel={t.locked} />
        </div>
      )}
      <p className={styles.soon} data-ecourse-soon="">
        {t.soon}
      </p>
    </div>
  );
}
