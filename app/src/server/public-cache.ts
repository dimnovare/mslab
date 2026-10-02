import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after } from "next/server";
import { revalidationTargets, targetTag, type PublicChange } from "./cache-targets";
import { writeTagRows } from "./tag-cache";

// The public pages are rendered once and served from the cache (open-next.config.ts). Whatever changes what a page
// shows makes that page stale here, so the next request renders it again: an admin "Salvesta", a registration or
// waitlist entry (seat counts). A session's start is handled by the Worker's cron (src/worker/session-starts.ts).
// Which pages show what: cache-targets.ts.
//
// The rows are written straight into OpenNext's D1 tag cache (tag-cache.ts), the same rows revalidatePath() would
// write, for two reasons:
// - revalidatePath() inside a server action makes Next.js render the current page into the action's answer (the course
//   page for a registration: 70–150 ms CPU in the visitor's POST, enough for a Workers Free 1102 after the
//   registration was stored);
// - the second write SETTLE_MS later must really happen: a second revalidatePath() of the same tags in after() is
//   dropped by Next.js (the tags are already pending).
// Under `next dev` there is no page cache (and no OpenNext build id): nothing to write.

export type { CacheTarget, PublicChange } from "./cache-targets";

/**
 * A render that began before a change but stored its page after it is dated by its start (server/page-store.ts), so
 * the change's own rows already make it stale. The same rows are written again this long after the change all the same
 * (after the response; the Worker waits without CPU), for anything that still slipped through.
 */
export const SETTLE_MS = 5000;

type Job = { write: () => Promise<void>; settled: () => Promise<void> };

/** The D1 binding and build id of the deployed Worker, or null (next dev, a build without the tag cache). */
function tagCache(): { db: D1Database; buildId: string } | null {
  const buildId = process.env.OPEN_NEXT_BUILD_ID;
  if (!buildId) return null;
  try {
    const db = getCloudflareContext().env.NEXT_TAG_CACHE_D1 as D1Database | undefined;
    return db ? { db, buildId } : null;
  } catch {
    return null;
  }
}

function job(change: PublicChange): Job | null {
  const tags = revalidationTargets(change).map(targetTag);
  const cache = tags.length ? tagCache() : null;
  if (!cache) return null;
  const write = () =>
    writeTagRows(cache.db, cache.buildId, tags, Date.now()).catch((e) => {
      // a failed write leaves the pages cached until the next change or the daily refresh: logged, never thrown at the
      // admin whose save has been stored (no personal data: tags are route names)
      console.error(`[public-cache] revalidation of ${tags.length} tags failed:`, e instanceof Error ? e.message : String(e));
    });
  return { write, settled: () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)).then(write) };
}

/**
 * Marks the pages that show `change` stale now (before the action answers: the next request renders them), and once
 * more SETTLE_MS later. For admin saves and the public forms (seat counts), once the change is stored. Only D1 rows
 * are written: no page is rendered into the action's answer.
 */
export async function revalidatePublic(change: PublicChange): Promise<void> {
  const j = job(change);
  if (!j) return;
  await j.write();
  after(j.settled);
}
