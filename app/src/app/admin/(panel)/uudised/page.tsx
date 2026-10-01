import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";
import { Shell } from "@/components/admin/Shell";
import { adminTitle } from "@/components/admin/sections";
import { adminEt } from "@/i18n/dict/admin";
import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: adminTitle(adminEt.nav.news) };

// "Tulekul" until the news editor (Task 13) replaces this page.
export default async function Page() {
  const email = await requireAdmin();
  return (
    <Shell email={email} active="news">
      <ComingSoon title={adminEt.nav.news} />
    </Shell>
  );
}
