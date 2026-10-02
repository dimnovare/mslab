import type { Metadata } from "next";
import { adminTitle } from "@/components/admin/sections";
import { SettingsEditor } from "@/components/admin/SettingsEditor";
import { Shell } from "@/components/admin/Shell";
import { getDb } from "@/db/client";
import { adminEt } from "@/i18n/dict/admin";
import { loadSettings } from "@/server/admin-site";
import { requireAdmin } from "@/server/auth";
import { serverEnv } from "@/server/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: adminTitle(adminEt.nav.settings) };

/** Seaded: contact details, social links, newsletter discount, legal pages; the admin addresses read-only (Task 13B). */
export default async function SettingsEditPage() {
  const email = await requireAdmin();
  const initial = await loadSettings(getDb());
  // the sign-in allow-list (the environment variable ADMIN_EMAILS): shown, never edited here
  const admins = serverEnv()
    .ADMIN_EMAILS.split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  return (
    <Shell email={email} active="settings">
      <SettingsEditor initial={initial} admins={admins} />
    </Shell>
  );
}
