import Link from "next/link";
import { fill } from "@/i18n/format";
import { href } from "@/i18n/href";
import { getDict, type Locale } from "@/i18n/locales";
import { Logo } from "./Logo";
import { Newsletter } from "./Newsletter";
import type { FooterContact, NewsletterSettings } from "./settings";
import styles from "./Footer.module.css";

/**
 * B footer (logo, slogan, three link columns, bottom line) with B's lilac newsletter block on top (H13).
 * Contact details and the newsletter discount come from the settings table.
 */
export function Footer({
  locale,
  newsletter,
  contact,
  trainerName,
}: {
  locale: Locale;
  newsletter: NewsletterSettings;
  contact?: FooterContact;
  trainerName?: string;
}) {
  const d = getDict(locale);
  const to = (path: string) => href(locale, path);

  return (
    <footer className={styles.footer}>
      <Newsletter
        locale={locale}
        t={{
          ...d.newsletter,
          body: fill(d.newsletter.body, { discount: newsletter.discountLabel }),
          sentText: d.newsletter.confirmText,
          errorEmail: d.forms.errorEmail,
          errorRequired: d.forms.errorRequired,
          errorTooMany: d.forms.errorTooMany,
          errorGeneric: d.forms.errorGeneric,
        }}
      />

      <div className={styles.main}>
        <div>
          <Logo href={to("/")} label={d.nav.home} className={styles.logo} />
          <p className={styles.text}>{d.footer.tagline}</p>
        </div>
        <div>
          <h2 className={styles.title}>{d.footer.learnTitle}</h2>
          <Link className={styles.link} href={to("/koolitused")}>
            {d.footer.allCourses}
          </Link>
          <Link className={styles.link} href={to("/koolituskalender")}>
            {d.nav.calendar}
          </Link>
          <Link className={styles.link} href={to("/praktika")}>
            {d.nav.practice}
          </Link>
        </div>
        <div>
          <h2 className={styles.title}>{d.footer.orgTitle}</h2>
          <Link className={styles.link} href={to("/koolitaja")}>
            {trainerName || d.nav.trainer}
          </Link>
          <Link className={styles.link} href={to("/uudised")}>
            {d.footer.news}
          </Link>
          <Link className={styles.link} href={to("/kontakt")}>
            {d.footer.contact}
          </Link>
        </div>
        <div>
          <h2 className={styles.title}>{d.footer.meetTitle}</h2>
          <p className={styles.text}>
            {d.footer.cities}
            <br />
            {d.footer.online}
          </p>
          {contact?.email && (
            <a className={`${styles.link} ${styles.contact}`} href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          )}
          {contact?.phone && (
            <a className={styles.link} href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
              {contact.phone}
            </a>
          )}
          {contact?.instagram && (
            <a className={styles.link} href={contact.instagram} target="_blank" rel="noopener noreferrer">
              Instagram ↗
            </a>
          )}
          {contact?.facebook && (
            <a className={styles.link} href={contact.facebook} target="_blank" rel="noopener noreferrer">
              Facebook ↗
            </a>
          )}
          <Link className={`${styles.link} ${styles.cta}`} href={to("/kontakt")}>
            {d.footer.contactCta} ↗
          </Link>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>{fill(d.footer.copyright, { year: new Date().getFullYear() })}</span>
        <div className={styles.legal}>
          <Link className={styles.link} href={to("/privaatsus")}>
            {d.footer.privacy}
          </Link>
          <Link className={styles.link} href={to("/tingimused")}>
            {d.footer.terms}
          </Link>
        </div>
      </div>
    </footer>
  );
}
