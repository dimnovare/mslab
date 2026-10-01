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
      // the run-unique part first: the server keeps 64 characters of the address, and a key that is the same in every run
      // would collect the rate limit of repeated runs (5 per 10 minutes)
      const ip = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-${info.retry}-${info.project.name}-${info.testId}`;
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
