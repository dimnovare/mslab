import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { Cart, cartMetadata } from "./cart";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? cartMetadata(locale) : {};
}

/** /ostukorv without a course: the empty cart. With ?kursus=<slug> the middleware serves ./[kursus] instead. */
export default async function EmptyCartPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Cart locale={locale} slug="" />;
}
