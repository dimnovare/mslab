import { requireAdmin } from "@/server/auth";

export const dynamic = "force-dynamic";

// Everything under (panel) is for signed-in admins. The layout is the first line of defence; it does not run again
// when the visitor moves between pages inside it, so each page (and action, and route handler) checks for itself.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
