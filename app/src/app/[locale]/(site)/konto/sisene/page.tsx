import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginForm } from "@/components/account/LoginForm";
import { getDict, isLocale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDict(locale);
  return { title: `${d.nav.login} — ${d.common.siteName}` };
}

/**
 * The client login page: a static shell like every /konto… page, the same for every visitor. No cookies, headers or
 * query are read here (the CDN serves it without a render, and nothing personal can enter its cache): `?viga` and
 * `?korda` are read by the form in the browser.
 */
export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDict(locale);
  return <LoginForm locale={locale} t={{ ...d.account.login, title: d.nav.login, badEmail: d.forms.errorEmail }} />;
}
