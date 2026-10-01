import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Don't let `next dev` write AGENTS.md / CLAUDE.md into the project.
  agentRules: false,
  // The whole host stays out of search engines until launch on mslab.ee (static files: public/_headers).
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;

// Makes getCloudflareContext() (and the Hyperdrive / R2 / KV bindings) work under `next dev`.
initOpenNextCloudflareForDev();
