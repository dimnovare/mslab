import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Notice } from "@/components/site/Notice";
import { PurchaseInterest } from "@/components/site/PurchaseInterest";
import ui from "@/components/site/ui.module.css";
import { getDb } from "@/db/client";
import { getCourseBySlug } from "@/db/queries/public";
import { formatEUR } from "@/domain/money";
import { pick } from "@/i18n/field";
import { href } from "@/i18n/href";
import { getDict, isLocale } from "@/i18n/locales";
import { mediaUrl } from "@/lib/media";
import styles from "./cart.module.css";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDict(locale);
  return { title: `${d.cart.title} — ${d.common.siteName}` };
}

/**
 * Cart (/ostukorv?kursus=<slug>), target of "Osta kohe" on an e-learning page (P9). Bank-link payment arrives later:
 * until then the page sums up the course, says payment opens soon and takes an e-mail to tell the visitor.
 * Only e-learning courses can be bought; contact courses are registered on their own page.
 */
export default async function CartPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const d = getDict(locale);
  const to = (path: string) => href(locale, path);
  const raw = (await searchParams).kursus;
  const slug = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const course = slug ? await getCourseBySlug(getDb(), slug) : null;

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
