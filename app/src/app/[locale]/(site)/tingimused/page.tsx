import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage, legalTitle } from "@/components/site/LegalPage";
import { getDict, isLocale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const title = await legalTitle("terms", locale);
  return title ? { title: `${title} — ${getDict(locale).common.siteName}` } : {};
}

/** /tingimused: the "terms" page text (footer and form links). */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalPage pageKey="terms" locale={locale} />;
}
