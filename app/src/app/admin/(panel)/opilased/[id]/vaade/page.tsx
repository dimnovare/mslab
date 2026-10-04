import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountShell } from "@/components/account/AccountShell";
import { CoursesTab } from "@/components/account/CoursesTab";
import { coursesTexts, shellTexts } from "@/components/account/texts";
import { adminTitle } from "@/components/admin/sections";
import { Shell } from "@/components/admin/Shell";
import ui from "@/components/admin/ui.module.css";
import { getDb } from "@/db/client";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import { getDict } from "@/i18n/locales";
import { clientLabel } from "@/server/admin-clients";
import { requireAdmin } from "@/server/auth";
import { loadDashboard } from "@/server/client-data";
import view from "./view.module.css";

// An admin page: rendered for every visit (the student's data, never a shared cache) and only for a signed-in admin.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: adminTitle(adminEt.viewAs.title) };

type Props = { params: Promise<{ id: string }> };

const parseId = (raw: string): number | null => (/^\d{1,10}$/.test(raw) && Number(raw) > 0 && Number(raw) <= 2_147_483_647 ? Number(raw) : null);

/**
 * "Vaata tema vaadet" (spec 7): the student's own "Minu koolitused", as she sees it — her cards, in her language, with the
 * dashboard loader of her account (/api/konto) — rendered here on the server with every button and link aria-disabled and
 * doing nothing (AccountShell / CoursesTab readOnly). Nothing of her account is touched: no session is read, made or ended,
 * nothing is sent, and the favourites copy of this browser is never written (that happens only in the account's own loader).
 * A student who does not exist: 404.
 */
export default async function ViewAsPage({ params }: Props) {
  const email = await requireAdmin();
  const id = parseId((await params).id);
  if (id === null) notFound();
  const db = getDb();
  const now = new Date();
  const [data, label] = await Promise.all([loadDashboard(db, id, now), clientLabel(db, id)]);
  if (!data || !label) notFound();
  const locale = data.client.locale;
  const d = getDict(locale);
  const t = adminEt.viewAs;

  return (
    <Shell email={email} active="clients">
      <div className={ui.page}>
        <Link className={ui.link} href={`/admin/opilased?id=${id}`} aria-label={t.backLabel} data-view-as-back="">
          <span aria-hidden="true">←</span> {t.back}
        </Link>
        <div className={view.preview} lang={locale} data-view-as={id}>
          <AccountShell
            tab="courses"
            locale={locale}
            t={shellTexts(d)}
            readOnly
            banner={<span lang="et">{fill(t.banner, { nimi: label })}</span>}
          >
            <CoursesTab locale={locale} t={coursesTexts(d)} data={data} readOnly now={now.toISOString()} />
          </AccountShell>
        </div>
      </div>
    </Shell>
  );
}
