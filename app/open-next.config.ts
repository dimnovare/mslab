import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import pageStore from "./src/server/page-store";

// The public pages are rendered once and served from the cache until a change makes them stale (Workers Free: 10 ms
// CPU per request, a render needs 40–70 ms). Free-plan pieces only:
// - incremental cache: R2 (NEXT_INC_CACHE_R2_BUCKET), read-after-write consistent everywhere; each page also under
//   the key cache interception reads (src/server/page-store.ts);
// - tag cache: D1 (NEXT_TAG_CACHE_D1), where a save marks the pages it changes stale (rows written directly, in
//   OpenNext's format: src/server/tag-cache.ts); strongly consistent, so the request after an admin "Salvesta" renders
//   the page again;
// - queue: the daily background refresh (revalidate in (site)/layout.tsx) through WORKER_SELF_REFERENCE;
// - cache interception: a cached page is answered from the routing layer without loading the Next.js server.
// The map of what each save revalidates: src/server/cache-targets.ts (written by src/server/public-cache.ts).
export default defineCloudflareConfig({
  incrementalCache: pageStore,
  tagCache: d1NextTagCache,
  queue: memoryQueue,
  enableCacheInterception: true,
});
