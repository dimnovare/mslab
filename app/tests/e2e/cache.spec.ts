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

/**
 * Asks until the page comes from the cache front. When it does not (another test's change made it stale), the page's
 * document is requested once: that renders it and stores the document, the RSC payload and the prefetch segments. (A
 * test's own RSC request is not a real router's: Next.js answers it with a redirect to its cache-busting address.)
 */
async function frontHit(request: import("@playwright/test").APIRequestContext, path: string, headers: Record<string, string> = {}) {
  let res = await request.get(path, { headers, maxRedirects: 0, failOnStatusCode: false });
  for (let i = 0; i < 3 && res.headers()["x-page-cache"] !== "front"; i++) {
    await request.get(path.split("?")[0]);
    res = await request.get(path, { headers, maxRedirects: 0, failOnStatusCode: false });
  }
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

    // the browser's copy of a payload is confirmed with a 304 (Cloudflare drops any ETag from HTML answers, so
    // documents are sent in full; RSC payloads and prefetches keep theirs)
    const etag = rsc.headers()["etag"];
    expect(etag, `${path} RSC ETag`).toBeTruthy();
    const again = await request.get(`${path}?_rsc=x`, { headers: { RSC: "1", "If-None-Match": etag } });
    expect(again.status(), `${path} If-None-Match`).toBe(304);
  }
});

test("per-visitor addresses share the one cached page, and nothing of the query is in it", async ({ request }) => {
  const plain = await (await frontHit(request, "/")).text();
  const notice = await request.get("/?uudiskiri=kinnitatud");
  expect(notice.headers()["x-page-cache"]).toBe("front");
  const html = await notice.text();
  expect(html, "the same cached page").toBe(plain);
  // the newsletter notice is put in by the browser (FlashNotice), never by the server: its region is empty in the HTML
  expect(html).toContain('data-flash-notice=""');
  expect(html).not.toMatch(/data-flash-notice="(ok|warn)"/);

  const page = await (await frontHit(request, COURSE)).text();
  const linked = await (await request.get(`${COURSE}?sessioon=1`)).text();
  expect(linked, "the same cached page").toBe(page);
  expect(linked, "no date is picked in the server's HTML").not.toMatch(/data-session="\d+"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-session="\d+"/);

  // the cart of one course is a page of its own (the middleware maps ?kursus to it)
  const cart = await (await frontHit(request, "/ostukorv?kursus=kulmumeistri-e-koolitus")).text();
  expect(cart).toContain("Kulmumeistri e-koolitus");
  expect(await (await frontHit(request, "/ostukorv")).text()).not.toBe(cart);
});

test("admin pages and the API never come from the page cache", async ({ request }) => {
  for (const path of ["/admin/login", "/api/feedback"]) {
    const res = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
    expect(res.headers()["x-page-cache"], `${path}: not a page request`).toBeUndefined();
  }
});

test("unknown addresses share their locale's one cached 404 page: status 404, noindex, the site's own 404 (round 2 item 21)", async ({ request }) => {
  for (const [locale, title, paths] of [
    ["et", "Lehte ei leitud", ["/olematu-leht", "/wp-admin", "/.env", "/koolitused/a/b", `/e2e-${Date.now()}`]],
    ["ru", "Страница не найдена", ["/ru/net-takoj", "/ru/wp-login.php", `/ru/e2e-${Date.now()}`]],
  ] as const) {
    // the first one may render it (once per locale, also after a change made it stale: on a deployment OpenNext may
    // answer that once from its stale copy and store the new render a moment later); every other address is then
    // answered from the same stored page
    await expect.poll(async () => (await request.get(paths[0], { failOnStatusCode: false })).headers()["x-page-cache"], { message: `${locale}: stored` }).toBe("front");
    for (const path of paths) {
      const res = await request.get(path, { failOnStatusCode: false });
      expect(res.status(), path).toBe(404);
      expect(res.headers()["x-page-cache"], `${path} (${locale})`).toBe("front");
      expect(res.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
      expect(await res.text(), path).toContain(title);
      const head = await request.head(path, { failOnStatusCode: false });
      expect(head.status(), `HEAD ${path}`).toBe(404);
    }
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
  const action = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(COURSE));
  await page.getByRole("button", { name: "Registreeru" }).click();
  await expect(page.getByText(/koht kinnitub pärast ettemaksu/)).toBeVisible();
  // the action's answer is the result only: no page rendered into it (a revalidatePath() in the action would make
  // Next.js render the course page there, 70–150 ms CPU after the registration was stored)
  const answer = await action;
  expect(answer.headers()["x-action-revalidated"], "no revalidation inside the action").toBeUndefined();
  expect((await answer.request().sizes()).responseBodySize, "the action's answer carries no page").toBeLessThan(2000);
  // revalidated before the answer (round 2 item 22): the very next request renders the page (the front says why), the
  // one after is cached again
  for (const path of checked) {
    expect((await request.get(path)).headers()["x-page-cache"], path).toBe("miss-revalidated");
    expect((await frontHit(request, path)).headers()["x-page-cache"], path).toBe("front");
  }
});

test("a cart for a course that does not exist is a 404 that says the cart is empty, never served by the front", async ({ request }) => {
  const res = await request.get("/ostukorv?kursus=ei-ole-olemas-e2e");
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain("Ostukorv on tühi");
  expect((await request.get("/ostukorv?kursus=ei-ole-olemas-e2e")).headers()["x-page-cache"]).not.toBe("front");
});

test("the client router keeps a cached page for 30 s at most (x-nextjs-stale-time)", async ({ request }) => {
  for (const path of ["/", COURSE]) {
    const rsc = await frontHit(request, `${path}?_rsc=st`, { RSC: "1" });
    expect(Number(rsc.headers()["x-nextjs-stale-time"]), path).toBeLessThanOrEqual(30);
  }
});
