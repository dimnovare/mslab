import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/site/Notice";
import { href } from "@/i18n/href";
import { getDict, isLocale } from "@/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDict(locale);
  return { title: `${d.nav.login} — ${d.common.siteName}` };
}

// "Logi sisse" target until the learner account arrives in phase 2.
export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDict(locale);
  return <Notice title={d.common.accountSoon} links={[{ href: href(locale, "/koolitused"), label: d.footer.allCourses }]} />;
}
