import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/i18n/locales";

// Placeholder until the real home page (Task 7); it only proves that the locale reaches the page.
// The layout provides <main>; the transparent home header overlaps the top by --header-h (the hero goes there).
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDict(locale);
  return (
    <section style={{ padding: "calc(var(--header-h) + 60px) var(--page) 60px", background: "var(--canvas)" }}>
      <h1>{dict.common.siteName}</h1>
      <p>{dict.meta.description}</p>
    </section>
  );
}
