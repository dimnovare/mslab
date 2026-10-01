import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/i18n/locales";

// Placeholder until the real home page (Task 7); it only proves that the locale reaches the page.
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDict(locale);
  return (
    <main style={{ padding: "var(--gutter)" }}>
      <h1>{dict.common.siteName}</h1>
      <p>{dict.meta.description}</p>
    </main>
  );
}
