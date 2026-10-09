import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/site/Notice";
import { PurchaseInterest } from "@/components/site/PurchaseInterest";
import ui from "@/components/site/ui.module.css";
import { getDb } from "@/db/client";
import { getCourseBySlug } from "@/db/queries/public";
import { formatEUR } from "@/domain/money";
import { pick } from "@/i18n/field";
import { href } from "@/i18n/href";
import { getDict, type Locale } from "@/i18n/locales";
import { mediaUrl } from "@/lib/media";
import styles from "./cart.module.css";

export function cartMetadata(locale: Locale): Metadata {
  const d = getDict(locale);
  return { title: `${d.cart.title} — ${d.common.siteName}` };
}

/**
 * Cart (/ostukorv?kursus=<slug>), target of "Osta kohe" on an e-learning page (P9). Bank-link payment arrives later:
 * until then the page sums up the course, says payment opens soon and takes an e-mail to tell the visitor.
 * Only e-learning courses can be bought; contact courses are registered on their own page.
 * The middleware serves "?kursus=<slug>" from ./[kursus] (one cached page per course); /ostukorv alone is the empty cart.
 * A course that does not exist or is not published is a 404 (./[kursus]/not-found.tsx says the cart is empty). Next.js
 * stores that 404 in its cache like any page, one ISR entry per made-up ?kursus=, so each such address is rendered once.
 */
export async function Cart({ locale, slug }: { locale: Locale; slug: string }) {
  const d = getDict(locale);
  const to = (path: string) => href(locale, path);
  const course = slug ? await getCourseBySlug(getDb(), slug) : null;
  if (slug && !course) notFound();

  if (!course || course.type !== "e_learning" || course.price == null) {
    return <Notice title={d.cart.emptyTitle} text={d.cart.emptyText} links={[{ href: to("/koolitused?vorm=e"), label: d.formats.elearning.link }]} />;
  }

  const title = pick(course.title, locale);
  const image = course.images[0];
  const price = formatEUR(course.price, locale);
  const c = d.course;
  return (
    <div className={`${ui.wrap} ${styles.page}`}>
      <p className={ui.eyebrow}>{d.formats.elearning.name}</p>
      <h1 className={styles.title}>{d.cart.title}</h1>
      <div className={styles.layout}>
        <article className={styles.item}>
          <div className={styles.photo}>{image && <Image className={styles.image} src={mediaUrl(image.key)} alt="" fill unoptimized sizes="160px" />}</div>
          <div className={styles.itemBody}>
            <h2 className={styles.itemTitle}>
              <Link href={to(`/koolitused/${course.slug}`)}>{title}</Link>
            </h2>
            <p className={styles.itemSummary}>{pick(course.summary, locale)}</p>
            <dl className={styles.facts}>
              {course.accessMonths ? (
                <div>
                  <dt>{c.accessLabel}</dt>
                  <dd>
                    {course.accessMonths} {c.monthsUnit}
                  </dd>
                </div>
              ) : null}
              {course.videoCount ? (
                <div>
                  <dt>{c.videosLabel}</dt>
                  <dd>{course.videoCount}</dd>
                </div>
              ) : null}
              <div>
                <dt>{c.languageLabel}</dt>
                <dd>{course.language}</dd>
              </div>
            </dl>
          </div>
          <p className={styles.itemPrice}>{price}</p>
        </article>

        <aside className={styles.summary} data-cart-summary="">
          <p className={styles.total}>
            <span>{d.cart.total}</span>
            <b>{price}</b>
          </p>
          <p className={styles.soon}>{c.checkoutSoon}</p>
          <PurchaseInterest
            course={course.slug}
            locale={locale}
            t={{
              email: d.forms.email,
              newsletterConsent: d.forms.newsletterConsent,
              submit: d.forms.interestSubmit,
              sending: d.forms.sending,
              sent: d.forms.interestSent,
              errorEmail: d.forms.errorEmail,
              errorTooMany: d.forms.errorTooMany,
              errorGeneric: d.forms.errorGeneric,
            }}
          />
        </aside>
      </div>
    </div>
  );
}
