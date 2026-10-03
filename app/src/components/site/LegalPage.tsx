import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { getPage } from "@/db/queries/public";
import { pick } from "@/i18n/field";
import type { Locale } from "@/i18n/locales";
import { LegalText } from "./LegalText";
import ui from "./ui.module.css";
import styles from "./LegalPage.module.css";

type LegalKey = "privacy" | "terms";

// One page query per request, shared by generateMetadata and the page.
const loadPage = cache(async (key: LegalKey) => {
  return getPage(getDb(), key);
});

/** A stored text page (privacy, terms; edited in admin): title and paragraphs in B's readable prose column. */
export async function LegalPage({ pageKey, locale }: { pageKey: LegalKey; locale: Locale }) {
  const page = await loadPage(pageKey);
  if (!page) notFound();
  return (
    <article className={`${ui.wrap} ${styles.page}`}>
      <div className={styles.inner}>
        <h1 className={styles.title}>{pick(page.title, locale)}</h1>
        <LegalText text={pick(page.body, locale)} />
      </div>
    </article>
  );
}

/** Page title for generateMetadata. */
export async function legalTitle(pageKey: LegalKey, locale: Locale): Promise<string> {
  const page = await loadPage(pageKey);
  return page ? pick(page.title, locale) : "";
}
