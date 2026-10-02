import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Don't let `next dev` write AGENTS.md / CLAUDE.md into the project.
  agentRules: false,
  // No "X-Powered-By: Next.js" on responses (N12).
  poweredByHeader: false,
  // The design-review hub (public/guide, public/p/<dir>) must keep its trailing slash ("/guide/"): its pages use
  // relative asset URLs. Next's own "/x/" → "/x" redirect is off; src/middleware.ts makes it for every other path.
  skipTrailingSlashRedirect: true,
  experimental: {
    // How long the browser's client router keeps a cached page it has visited or prefetched (x-nextjs-stale-time) before
    // asking again: the public pages are cached on the Worker now (open-next.config.ts), and an open tab should see an
    // admin's change on its next navigation within this time. 30 s is the least Next.js accepts (default 300).
    staleTimes: { dynamic: 0, static: 30 },
  },
  env: {
    // Review tools: Maria's comment widget (public/feedback.js) on every public page, posting to /api/feedback.
    // On ("1") for the review builds; switched off ("0") at the mslab.ee launch. Inlined at build time, not a secret.
    NEXT_PUBLIC_REVIEW_TOOLS: "1",
  },
  // The whole host stays out of search engines until launch on mslab.ee (static files: public/_headers).
  // Pages may be framed by this site's own pages only (static files: public/_headers; cached pages: the Worker's
  // front, src/worker/page-front.ts FRAMING).
  // The admin area and the login endpoints answer per visitor and are never cached (by the browser or the edge).
  async headers() {
    const noStore = [{ key: "Cache-Control", value: "no-store" }];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      { source: "/admin/:path*", headers: noStore },
      { source: "/api/auth/:path*", headers: noStore },
      { source: "/api/admin/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;

// Makes getCloudflareContext() (and the Hyperdrive / R2 / KV bindings) work under `next dev`.
initOpenNextCloudflareForDev();
