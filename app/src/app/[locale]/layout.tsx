import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Jost, Manrope, JetBrains_Mono } from "next/font/google";
import { getDict, isLocale } from "@/i18n/locales";
import "@/styles/tokens.css";
import "@/styles/globals.css";

const jost = Jost({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["300", "400", "500"],
  variable: "--font-jost",
});

const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-manrope",
});

const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jbmono",
});

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDict(locale);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    robots: { index: false, follow: false },
  };
}

// Root layout of the public site: it renders <html> so that lang follows the locale (et at "/", ru at "/ru").
export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={`${jost.variable} ${manrope.variable} ${jbmono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
