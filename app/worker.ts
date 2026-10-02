// Not type-checked with the app (tsconfig.json excludes it): it imports the generated .open-next/worker.js, which exists
// only after `opennextjs-cloudflare build`. The logic is in src/ (typed and unit-tested); wrangler bundles this file.
// The Worker's entry (wrangler.jsonc "main"): uploaded images and the cached-page front first, OpenNext for everything
// else, and the cron.
import process from "node:process";
import openNext from "./.open-next/worker.js";
import { runAsRequest } from "./src/worker/request-context";
import { mediaAnswer } from "./src/worker/media-front";
import { afterFront, frontAnswer } from "./src/worker/page-front";
import { onSchedule } from "./src/worker/session-starts";

// Durable Object classes OpenNext's entry exports (none is bound here; kept so the entry stays a drop-in).
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const worker = {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    // An uploaded image: from the edge cache or R2, without OpenNext and Next.js (src/worker/media-front.ts)
    const media = await mediaAnswer(request, env, { cache: caches.default, waitUntil: (p) => ctx.waitUntil(p) });
    if (media) return media;
    // Each request in a scope of its own (src/server/request-scope.ts): its start, taken before any I/O (a page rendered
    // by this request is dated by it: src/server/page-store.ts), and its per-request values (src/server/per-request.ts:
    // its database client, its signed-in admin).
    return runAsRequest(Date.now(), async () => {
      // OPEN_NEXT_BUILD_ID is set when OpenNext's bundle loads (imported above)
      const answer = await frontAnswer(request, env, process.env.OPEN_NEXT_BUILD_ID);
      if (answer && "response" in answer) return answer.response;
      // a cached page answered by OpenNext carries a Cache-Control meant for a CDN: browsers get the front's instead;
      // a page request also says why the front left it to OpenNext
      return afterFront(await openNext.fetch(request, env, ctx), answer?.miss ?? null);
    });
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
