import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { Cart, cartMetadata } from "../cart";

type Props = { params: Promise<{ locale: string; kursus: string }> };

/** Rendered on the first visit and cached, like every public page (app/[locale]/layout.tsx). */
export function generateStaticParams(): { kursus: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? cartMetadata(locale) : {};
}

/** The cart of one course: /ostukorv?kursus=<slug>, which the middleware serves from here (a cached page per course). */
export default async function CartPage({ params }: Props) {
  const { locale, kursus } = await params;
  if (!isLocale(locale)) notFound();
  return <Cart locale={locale} slug={kursus.trim()} />;
}
