import { LOCAL_FIXTURES, testEmail } from "./fixtures";
import { PROD_BUILD, TARGET } from "./target";
import { submitsForms, test, expect } from "./test";

// Task 17: the public pages are rendered once and served from the cache (open-next.config.ts, src/worker/page-front.ts).
// These run against a production build only: a deployment (read-only) or the local production build (E2E_PROD_BUILD).
// `next dev` renders every request, so there is nothing to check there. The admin freshness contract (a save shows on
// the next request) is checked by admin-edit.spec.ts and admin-site.spec.ts, which run against the local production
// build too.

const CACHED = !!TARGET && (PROD_BUILD || !LOCAL_FIXTURES);
test.skip(!CACHED, "the page cache exists in a production build only (E2E_PROD_BUILD=1 locally, or a deployment)");
test.skip(({ isMobile }) => isMobile, "the same answers for every browser: desktop project only");

const COURSE = "/koolitused/kulmumeistri-baaskoolitus";
const BROWSER = "public, max-age=0, must-revalidate";

/** Asks until the page comes from the cache front (the first request after a change renders and stores it). */
async function frontHit(request: import("@playwright/test").APIRequestContext, path: string, headers: Record<string, string> = {}) {
  let res = await request.get(path, { headers });
  for (let i = 0; i < 3 && res.headers()["x-page-cache"] !== "front"; i++) res = await request.get(path, { headers });
  return res;
}

test("a page, its navigation payload and its prefetch tree come from the cache front, with browser-safe caching", async ({ request }) => {
  for (const path of ["/", COURSE, "/ru/koolituskalender"]) {
    const html = await frontHit(request, path);
    expect(html.status(), path).toBe(200);
    expect(html.headers()["x-page-cache"], path).toBe("front");
    expect(html.headers()["content-type"], path).toMatch(/^text\/html/);
    expect(html.headers()["cache-control"], `${path}: browsers must ask again (no stale-while-revalidate)`).toBe(BROWSER);
    expect(html.headers()["x-robots-tag"], path).toBe("noindex, nofollow");

    const rsc = await frontHit(request, `${path}?_rsc=x`, { RSC: "1" });
    expect(rsc.headers()["x-page-cache"], `${path} RSC`).toBe("front");
    expect(rsc.headers()["content-type"]).toBe("text/x-component");
    // the client router learns about the middleware's /et rewrite, as from Next.js itself
    expect(rsc.headers()["x-nextjs-rewritten-path"], path).toBe(path.startsWith("/ru") ? undefined : path === "/" ? "/et" : `/et${path}`);

    const tree = await frontHit(request, `${path}?_rsc=y`, { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree" });
    expect(tree.headers()["x-page-cache"], `${path} tree`).toBe("front");
    expect(tree.headers()["x-nextjs-prerender"]).toBe("1");

    // the browser's copy is confirmed with a 304
    const again = await request.get(path, { headers: { "If-None-Match": html.headers()["etag"] } });
    expect(again.status(), `${path} If-None-Match`).toBe(304);
  }
});

test("per-visitor addresses share the one cached page, and nothing of the query is in it", async ({ request }) => {
  const plain = await frontHit(request, "/");
  const notice = await request.get("/?uudiskiri=kinnitatud");
  expect(notice.headers()["x-page-cache"]).toBe("front");
  expect(notice.headers()["etag"]).toBe(plain.headers()["etag"]);
  // the newsletter notice is put in by the browser (FlashNotice), never by the server: its region is empty in the HTML
  const html = await notice.text();
  expect(html).toContain('data-flash-notice=""');
  expect(html).not.toMatch(/data-flash-notice="(ok|warn)"/);

  const page = await frontHit(request, COURSE);
  const linked = await request.get(`${COURSE}?sessioon=1`);
  expect(linked.headers()["etag"]).toBe(page.headers()["etag"]);
  expect(await linked.text(), "no date is picked in the server's HTML").not.toMatch(/data-session="\d+"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-session="\d+"/);

  // the cart of one course is a page of its own (the middleware maps ?kursus to it)
  const cart = await frontHit(request, "/ostukorv?kursus=kulmumeistri-e-koolitus");
  expect(await cart.text()).toContain("Kulmumeistri e-koolitus");
  expect((await frontHit(request, "/ostukorv")).headers()["etag"]).not.toBe(cart.headers()["etag"]);
});

test("admin pages, the API and unknown addresses never come from the page cache", async ({ request }) => {
  for (const path of ["/admin/login", "/api/feedback", "/olematu-leht"]) {
    const res = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
    expect(res.headers()["x-page-cache"], path).toBeUndefined();
  }
});

test("a registration makes the course page and the calendar render again (seat counts)", async ({ page, request }, info) => {
  submitsForms();
  test.skip(!PROD_BUILD, "submits a form: the local production build only");
  // the pages to check: the course page itself and two the page does not link to (the browser would prefetch, and so
  // render, a linked page as soon as the action has revalidated it)
  const checked = [COURSE, "/ru/koolitused/kulmumeistri-baaskoolitus", "/ru/koolituskalender"];
  for (const path of checked) expect((await frontHit(request, path)).headers()["x-page-cache"], path).toBe("front");
  await page.goto(COURSE);
  await page.getByRole("radio", { name: /Grupikoolitus/ }).check();
  await page.locator("[data-session]:not([aria-disabled='true'])").first().click();
  await page.getByLabel("Nimi").fill("Test Õpilane");
  await page.getByLabel("E-post", { exact: true }).fill(testEmail("cache-register", info.project.name));
  await page.getByLabel("Telefon").fill("+3725555555");
  await page.getByLabel(/tingimustega/).check();
  await page.getByRole("button", { name: "Registreeru" }).click();
  await expect(page.getByText(/koht kinnitub pärast ettemaksu/)).toBeVisible();
  // revalidated: the next request renders the page (not from the front), the one after is cached again
  for (const path of checked) {
    expect((await request.get(path)).headers()["x-page-cache"], path).toBeUndefined();
    expect((await frontHit(request, path)).headers()["x-page-cache"], path).toBe("front");
  }
});
