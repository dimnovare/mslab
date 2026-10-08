import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, LOCALES } from "@/i18n/locales";
import { fontVariables } from "../../fonts";
import "@/styles/tokens.css";
import "@/styles/globals.css";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/**
 * The coming-soon page's own root layout (a third one, next to the public site's app/[locale] and the admin's app/admin):
 * <html> in the page's language, the site's fonts and tokens, and nothing else. Not the site's layout: its link-preview
 * tags read SITE_URL, and this page is built with the app (`next build`), which must succeed with an empty environment
 * (docs/deploy.md section 2). Both languages are built; any other value of [locale] is a 404.
 */
export function generateStaticParams(): { locale: string }[] {
  return LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDict(locale);
  return { title: d.common.siteName, description: d.meta.description, robots: { index: false, follow: false } };
}

export default async function ComingSoonLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
