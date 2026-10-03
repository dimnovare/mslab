import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountGate } from "@/components/account/AccountGate";
import { Notice } from "@/components/site/Notice";
import { href } from "@/i18n/href";
import { getDict, isLocale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDict(locale);
  return { title: `${d.nav.account} — ${d.common.siteName}` };
}

/**
 * "Minu konto": a static shell, the same for every visitor (no cookies, headers or query read here). The browser asks
 * /api/konto/me who is signed in (AccountGate): nobody → the login page; another device signed in since → the message
 * with "Saada uus kood". The signed-in content is still the placeholder until the dashboard arrives (phase 2a Task 6).
 */
export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDict(locale);
  return (
    <AccountGate locale={locale} t={d.account.signedOut}>
      <Notice title={d.common.accountSoon} links={[{ href: href(locale, "/koolitused"), label: d.footer.allCourses }]} />
    </AccountGate>
  );
}
