import { revalidatePath } from "next/cache";
import { logFailure } from "./log";
import { revalidationTargets, type PublicChange } from "./cache-targets";

// The public pages are rendered once and served from Next.js's cache (incremental static regeneration; on Vercel its
// CDN and cache). Whatever changes what a page shows makes that page stale here, so the next request renders it again:
// an admin "Salvesta", a registration or waitlist entry (seat counts). Which pages show what: cache-targets.ts.
// A session's start is not a save: the pages that list dates revalidate every 5 minutes on their own (their
// `revalidate`), and every public page once a day ((site)/layout.tsx).
//
// revalidatePath() expires the pages at once (no stale copy is served afterwards): the request after the save waits for
// a new render. Inside a server action it also makes Next.js render the current page into the action's answer, so the
// open page shows the change too.

export type { CacheTarget, PublicChange } from "./cache-targets";

/**
 * Marks the pages that show `change` stale, for admin saves and the public forms (seat counts), once the change is
 * stored and before the action answers. A failure is logged and never thrown at the person whose change is stored (the
 * pages then catch up with their own `revalidate`).
 */
export function revalidatePublic(change: PublicChange): void {
  for (const target of revalidationTargets(change)) {
    try {
      revalidatePath(target.path, target.type);
    } catch (e) {
      // no personal data: the path is a route name or a course address
      logFailure(`[public-cache] revalidating ${target.path} failed`, e);
    }
  }
}
