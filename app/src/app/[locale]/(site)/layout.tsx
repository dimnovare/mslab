import { notFound } from "next/navigation";
import { connection } from "next/server";
import Script from "next/script";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { shellSettings, type ShellSettings } from "@/components/site/settings";
import { getDb } from "@/db/client";
import { getSettings } from "@/db/queries/public";
import { isLocale } from "@/i18n/locales";

// Footer contact and newsletter discount are read per request, so every public page renders dynamically.
async function loadShellSettings(): Promise<ShellSettings> {
  await connection();
  try {
    return shellSettings(await getSettings(getDb()));
  } catch (err) {
    // The shell must not take the whole site down; fall back to defaults.
    console.error("site shell: settings unavailable:", err instanceof Error ? err.message : err);
    return shellSettings({});
  }
}

// Review tools until launch: Maria's comment widget (public/feedback.js → /api/feedback) on every public page, never in
// /admin (its own root layout). NEXT_PUBLIC_REVIEW_TOOLS is set in next.config.ts and switched off at the mslab.ee launch.
const REVIEW_TOOLS = process.env.NEXT_PUBLIC_REVIEW_TOOLS === "1";

// Site shell: B header, page content (<main id="main">, pages must not render their own <main>), footer with newsletter.
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const settings = await loadShellSettings();
  return (
    <>
      <Header locale={locale} />
      <main id="main">{children}</main>
      <Footer locale={locale} newsletter={settings.newsletter} contact={settings.contact} trainerName={settings.trainerName} />
      {REVIEW_TOOLS && <Script src="/feedback.js?v=4" strategy="afterInteractive" />}
    </>
  );
}
