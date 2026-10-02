import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/i18n/locales";
import { shareMetadata } from "@/server/share-meta";
import { fontVariables } from "../fonts";
import "@/styles/tokens.css";
import "@/styles/globals.css";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDict(locale);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    robots: { index: false, follow: false },
    // a link to any public page shows the home page's preview card (the home page adds its own og:url)
    ...(await shareMetadata(locale)),
  };
}

// Root layout of the public site: it renders <html> so that lang follows the locale (et at "/", ru at "/ru").
// The admin area (app/admin) is a second root layout.
export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
