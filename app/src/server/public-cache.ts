import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { revalidationTargets, type CacheTarget, type PublicChange } from "./cache-targets";

// The public pages are rendered once and served from the cache (open-next.config.ts). Whatever changes what a page
// shows makes that page stale here, so the next request renders it again: an admin "Salvesta", a registration or
// waitlist entry (seat counts). A session's start is handled by the Worker's cron (src/worker/session-starts.ts).
// Which pages show what: cache-targets.ts.

export type { CacheTarget, PublicChange } from "./cache-targets";

/**
 * A render that read the database just before a change and stored its page just after it would pass for fresh. The
 * same pages are revalidated again this long after the change (after the response; the Worker waits without CPU).
 */
export const SETTLE_MS = 5000;

function revalidateTargets(targets: CacheTarget[]): void {
  for (const t of targets) revalidatePath(t.path, t.type);
}

/**
 * Marks the pages that show `change` stale (call it from a server action or route handler once the change is stored):
 * the next request renders them again. Once more after SETTLE_MS, for a render that overlapped the change.
 */
export function revalidatePublic(change: PublicChange): void {
  const targets = revalidationTargets(change);
  if (targets.length === 0) return;
  revalidateTargets(targets);
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    revalidateTargets(targets);
  });
}
