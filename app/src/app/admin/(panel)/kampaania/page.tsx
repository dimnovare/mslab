import type { Metadata } from "next";
import { CampaignEditor } from "@/components/admin/CampaignEditor";
import { adminTitle } from "@/components/admin/sections";
import { Shell } from "@/components/admin/Shell";
import { getDb } from "@/db/client";
import { adminEt } from "@/i18n/dict/admin";
import { loadCampaign } from "@/server/admin-site";
import { requireAdmin } from "@/server/auth";
import { linkSuggestions } from "@/server/site-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: adminTitle(adminEt.nav.campaign) };

/** Kampaania: prototype D adminCamp with an image upload and the popup card as a live preview (Task 13B, M2–M5). */
export default async function CampaignEditPage() {
  const email = await requireAdmin();
  const db = getDb();
  const [initial, links] = await Promise.all([loadCampaign(db), linkSuggestions(db)]);
  return (
    <Shell email={email} active="campaign">
      <CampaignEditor initial={initial} links={links} />
    </Shell>
  );
}
