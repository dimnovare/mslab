import { notFound } from "next/navigation";
import Script from "next/script";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { shellSettings, type ShellSettings } from "@/components/site/settings";
import { getSiteSettings } from "@/server/site-data";
import { isLocale } from "@/i18n/locales";

/**
 * Every public page is cached once rendered (open-next.config.ts) and rendered again when an admin save, a registration
 * or a session's start makes it stale (server/public-cache.ts). This is the safety net on top of that: a page is
 * refreshed in the background at most once a day, so a change made around the site (directly in the database) shows
 * within a day. Nothing here may depend on the request: no headers, cookies, query strings or connection().
 */
export const revalidate = 86400;

// Footer contact and newsletter discount come from the settings (a settings save revalidates every page). A failing
// read is not replaced by defaults: the page is cached once rendered, and a footer without the contact details would
// stay for a day. Failing, the render keeps the page's previous copy in use (and a page never rendered shows the error).
async function loadShellSettings(): Promise<ShellSettings> {
  try {
    return shellSettings(await getSiteSettings());
  } catch (err) {
    console.error("site shell: settings unavailable:", err instanceof Error ? err.message : err);
    throw err;
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
      {REVIEW_TOOLS && <Script src="/feedback.js?v=5" strategy="afterInteractive" />}
    </>
  );
}
