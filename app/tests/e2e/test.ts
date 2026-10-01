import { test as base, expect } from "@playwright/test";
import { LOCAL_FIXTURES } from "./fixtures";

// `test` for specs that submit forms.
// - Every test is its own visitor: the forms allow 5 submissions per 10 minutes per visitor IP (KV rate limit), and
//   against `next dev` the IP comes from x-forwarded-for, so repeated runs do not hit the limit. On Cloudflare the
//   edge's cf-connecting-ip wins and this header changes nothing.
// - Against anything but the local dev server (E2E_BASE_URL + E2E_ALLOW_REMOTE=1), every POST is blocked: a deployment's
//   database and notifications are real, and tests must never submit to it. Tests that submit call submitsForms()
//   and are skipped there.
export const test = base.extend<{ visitorIp: string }>({
  visitorIp: [
    async ({ context }, use, info) => {
      if (!LOCAL_FIXTURES) {
        await context.route("**/*", (route) => (route.request().method() === "POST" ? route.abort("blockedbyclient") : route.fallback()));
      }
      const ip = `e2e-${info.project.name}-${info.testId}-${info.retry}-${Date.now().toString(36)}`;
      await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await use(ip);
    },
    { auto: true },
  ],
});

/** First line of every test that submits a form: it runs against the local dev server only, never a deployment. */
export function submitsForms(): void {
  test.skip(!LOCAL_FIXTURES, "submits a form: runs against the local dev server only, never a deployment");
}

export { expect };
