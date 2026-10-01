import { test as base, expect } from "@playwright/test";

// `test` for specs that submit forms. The forms allow 5 submissions per 10 minutes per visitor IP (KV rate limit);
// against `next dev` the IP comes from x-forwarded-for, so every test is its own visitor and repeated runs do not
// hit the limit. On Cloudflare the edge's cf-connecting-ip wins and this header changes nothing.
export const test = base.extend<{ visitorIp: string }>({
  visitorIp: [
    async ({ context }, use, info) => {
      const ip = `e2e-${info.project.name}-${info.testId}-${info.retry}-${Date.now().toString(36)}`;
      await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await use(ip);
    },
    { auto: true },
  ],
});

export { expect };
