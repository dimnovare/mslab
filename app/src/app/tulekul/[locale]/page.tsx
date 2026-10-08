import Image from "next/image";
import { notFound } from "next/navigation";
import { FlashNotice, type FlashMessage } from "@/components/site/FlashNotice";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { SiteReady } from "@/components/site/SiteReady";
import { getDict, isLocale } from "@/i18n/locales";
import styles from "./tulekul.module.css";

type Props = { params: Promise<{ locale: string }> };

/**
 * Both languages are built with the app (`next build`, the layout's static params) and never rendered again: the page
 * reads nothing (no database, no request, no setting), and the gate serves it for every address of the site.
 */
export const dynamic = "force-static";

/**
 * The coming-soon page (hotfix 08.10): while the site's content is still sample content, the middleware answers every
 * page request of a visitor with this page (a rewrite to /tulekul/et or /tulekul/ru, lib/site-gate.ts); signed-in admins
 * (the preview cookie) see the site. Outside the site's shell (no header, footer or review widget): the logo, the
 * heading, one line and the newsletter's own sign-up (the subscribe action, double opt-in; its line under "Liitu" has no
 * privacy link here: the gate does not serve /privaatsus to visitors). The confirmation link sends
 * the visitor to "/?uudiskiri=…", which is this page here: the notice reads the address in the browser (FlashNotice).
 * Not a page of the site: with the gate off, or for an admin, /tulekul/et is the 404 page (lib/site-routing.ts). The title,
 * description and noindex are the layout's.
 */
export default async function ComingSoon({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDict(locale);
  const nl = d.newsletter;
  const notices: Record<string, FlashMessage> = {
    kinnitatud: { tone: "ok", title: nl.confirmedTitle, text: nl.confirmedText },
    vigane: { tone: "warn", title: d.gate.linkInvalid },
    viga: { tone: "warn", title: d.forms.errorGeneric },
  };

  return (
    <main id="main" className={styles.page} data-coming-soon="">
      <div className={styles.inner}>
        <Image className={styles.logo} src="/brand/logo.png" alt={d.gate.logo} width={332} height={128} unoptimized loading="eager" />
        <h1 className={styles.title}>{d.gate.title}</h1>
        <p className={styles.lead}>{d.gate.lead}</p>
        <section className={styles.panel} aria-labelledby="tulekul-uudiskiri">
          <h2 id="tulekul-uudiskiri" className={styles.sr}>
            {nl.eyebrow}
          </h2>
          <NewsletterForm
            locale={locale}
            className={styles.form}
            privacyLink={false}
            t={{
              emailLabel: nl.emailLabel,
              emailPlaceholder: nl.emailPlaceholder,
              submit: nl.submit,
              notice: nl.notice,
              sentTitle: nl.sentTitle,
              sentText: nl.confirmText,
              errorEmail: d.forms.errorEmail,
              errorTooMany: d.forms.errorTooMany,
              errorGeneric: d.forms.errorGeneric,
            }}
          />
        </section>
      </div>
      <FlashNotice param="uudiskiri" notices={notices} closeLabel={d.common.close} />
      <SiteReady />
    </main>
  );
}
