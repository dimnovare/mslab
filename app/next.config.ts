import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Don't let `next dev` write AGENTS.md / CLAUDE.md into the project.
  agentRules: false,
};

export default nextConfig;

// Makes getCloudflareContext() (and the Hyperdrive / R2 / KV bindings) work under `next dev`.
initOpenNextCloudflareForDev();
