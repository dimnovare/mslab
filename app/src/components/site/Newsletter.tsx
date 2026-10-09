"use client";

import { useId } from "react";
import type { Locale } from "@/i18n/locales";
import { NewsletterForm, type NewsletterFormTexts } from "./NewsletterForm";
import styles from "./Newsletter.module.css";

export type NewsletterTexts = NewsletterFormTexts & {
  eyebrow: string;
  titleFirst: string;
  titleSecond: string;
  body: string;
};

/**
 * B newsletter block ("MS LABi kirjad"), lilac surface, placed inside the footer (H13; phase 2c: the card in the footer's right
 * column): the heading and the sign-up (NewsletterForm, which is also the coming-soon page's and the home page's newsletter popup's).
 */
export function Newsletter({ locale, t }: { locale: Locale; t: NewsletterTexts }) {
  const id = useId();
  return (
    <section className={styles.newsletter} aria-labelledby={`${id}-title`} data-footer-newsletter="">
      <div>
        <p className={styles.eyebrow}>{t.eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.title}>
          {t.titleFirst}
          <br />
          {t.titleSecond}
        </h2>
        <p className={styles.text}>{t.body}</p>
      </div>
      <NewsletterForm locale={locale} t={t} />
    </section>
  );
}
