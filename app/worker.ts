// Not type-checked with the app (tsconfig.json excludes it): it imports the generated .open-next/worker.js, which exists
// only after `opennextjs-cloudflare build`. The logic is in src/worker/ (typed and unit-tested); wrangler bundles this file.
// The Worker's entry (wrangler.jsonc "main"): the cached-page front first, OpenNext for everything else, and the cron.
import process from "node:process";
import openNext from "./.open-next/worker.js";
import { forBrowsers, servePageFromCache } from "./src/worker/page-front";
import { onSchedule } from "./src/worker/session-starts";

// Durable Object classes OpenNext's entry exports (none is bound here; kept so the entry stays a drop-in).
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const worker = {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    // OPEN_NEXT_BUILD_ID is set when OpenNext's bundle loads (imported above)
    const cached = await servePageFromCache(request, env, process.env.OPEN_NEXT_BUILD_ID);
    // a cached page answered by OpenNext carries a Cache-Control meant for a CDN: browsers get page-front.ts's instead
    return cached ?? forBrowsers(await openNext.fetch(request, env, ctx));
  },

  async scheduled(controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      onSchedule(env, controller.scheduledTime, process.env.OPEN_NEXT_BUILD_ID).then(
        (what) => console.log(`[cron] ${what}`),
        (e) => console.error("[cron] failed:", e instanceof Error ? e.message : e),
      ),
    );
  },
};

export default worker;
