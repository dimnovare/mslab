import type { BrowserContext, Page } from "@playwright/test";
import { submitsForms, test, expect } from "./test";
import { authTestEmail, expireAuthToken, removeAdminRows, sessionExists, storedAuthTokens } from "./fixtures";

// Task 11: admin sign-in by magic link. The tests that sign in or ask for a link run against the local dev server only
// (they use the real admin addresses, which is safe because `next dev` has no RESEND_API_KEY — global-setup refuses to
// run otherwise — and the answer carries a devLink); they delete the token and session rows they created. The GET-only
// tests also run against a deployment.

const SENT = "Kui see aadress on lubatud, saatsime sisselogimislingi.";
const BUTTON = "Saada sisselogimislink";
const LINK_ERROR = "See sisselogimislink on aegunud või juba kasutatud. Telli uus link.";
const DAY = 24 * 60 * 60;

// Raw tokens and session ids created by the running test (tests of one worker run one after the other).
const created = { tokens: new Set<string>(), sessions: new Set<string>() };

test.afterEach(async () => {
  await removeAdminRows({ tokens: created.tokens, sessions: created.sessions }).catch(() => {});
  created.tokens.clear();
  created.sessions.clear();
});

const tokenOf = (link: string) => new URL(link).searchParams.get("t")!;
/** The link's path and query, to open on whatever origin the test runs against (the link carries the site's own origin). */
const pathOf = (link: string) => {
  const u = new URL(link);
  return u.pathname + u.search;
};

type Answer = { status: number; headers: Record<string, string>; body: { ok: boolean; devLink?: string; error?: string } };

/**
 * Types the address, clicks the button and returns the server's answer. The answer is read on the way through (a route
 * that fetches it and hands it on): Playwright's own response.json() never returns for these no-store streamed bodies.
 */
async function submitLogin(page: Page, address: string): Promise<Answer> {
  const answer = new Promise<Answer>((resolve, reject) =>
    page
      .route(
        "**/api/auth/request",
        async (route) => {
          try {
            const response = await route.fetch({ headers: await route.request().allHeaders() }); // keeps the visitor's x-forwarded-for
            const body = await response.json();
            await route.fulfill({ response });
            resolve({ status: response.status(), headers: response.headers(), body });
          } catch (e) {
            reject(e);
          }
        },
        { times: 1 },
      )
      .catch(reject),
  );
  await page.getByLabel("E-post").fill(address);
  await page.getByRole("button", { name: BUTTON }).click();
  const a = await answer;
  if (a.body.devLink) created.tokens.add(tokenOf(a.body.devLink));
  return a;
}

/** Opens the login page and asks for a link. */
async function requestLink(page: Page, address: string): Promise<Answer> {
  await page.goto("/admin/login");
  return submitLogin(page, address);
}

async function sessionCookie(context: BrowserContext) {
  const cookie = (await context.cookies()).find((c) => c.name === "mslab_admin");
  if (cookie) created.sessions.add(cookie.value);
  return cookie;
}

/** Signs in through the form and the devLink; lands on /admin. */
async function signIn(page: Page, context: BrowserContext, address: string): Promise<{ devLink: string; session: string }> {
  const { status, body } = await requestLink(page, address);
  expect(status).toBe(200);
  expect(body.devLink, "devLink in the local answer").toBeTruthy();
  await page.goto(pathOf(body.devLink!));
  await expect(page).toHaveURL(/\/admin$/);
  const cookie = await sessionCookie(context);
  expect(cookie, "session cookie").toBeTruthy();
  return { devLink: body.devLink!, session: cookie!.value };
}

test.describe("guard", () => {
  test("/admin without a session redirects to the login page, uncached and noindex", async ({ page, request }) => {
    const res = await request.get("/admin", { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
    expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/admin/login");
    // `next dev` answers pages with "no-cache, must-revalidate"; the production build with "no-store" (checked on the deployment).
    expect(res.headers()["cache-control"]).toMatch(/no-store|no-cache/);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Halduse sisselogimine" })).toBeVisible();
  });

  test("a made-up session cookie is not a session", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "mslab_admin", value: "A".repeat(43), url: baseURL! }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await context.addCookies([{ name: "mslab_admin", value: "nope", url: baseURL! }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("the admin login endpoints answer with Cache-Control: no-store", async ({ request }) => {
    const verify = await request.get("/api/auth/verify?t=nope", { maxRedirects: 0 });
    expect(verify.headers()["cache-control"]).toContain("no-store");
    expect(verify.headers()["referrer-policy"]).toBe("no-referrer");
    expect(verify.headers()["set-cookie"]).toBeUndefined();
  });
});

test.describe("login page", () => {
  test("Estonian page with its own root layout: noindex, labelled field, post form, logo, 44px targets, no overflow", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "et");
    await expect(page).toHaveTitle(/Haldus/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const form = page.locator("[data-login-form]");
    await expect(form).toHaveAttribute("method", "post");
    const email = page.getByLabel("E-post");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocomplete", "email");
    const button = page.getByRole("button", { name: BUTTON });
    await expect(button).toBeVisible();
    await expect(page.getByRole("link", { name: "MS LAB Koolituskeskuse avalehele" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "MS LAB Koolituskeskuse avalehele" }).locator("img")).toBeVisible();
    for (const target of [email, button]) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // the fonts of the shared module are applied (Jost heading, Manrope body)
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /Jost/);
    await expect(button).toHaveCSS("font-family", /Manrope/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // keyboard order: the field, then the button
    await email.focus();
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
  });

  test("a link that did not work says so", async ({ page }) => {
    await page.goto("/admin/login?viga=link");
    await expect(page.locator("main").getByRole("alert")).toHaveText(LINK_ERROR);
    await page.goto("/admin/login?viga=server");
    await expect(page.locator("main").getByRole("alert")).toHaveText("Sisselogimine ei õnnestunud. Proovi uuesti.");
    await page.goto("/admin/login?viga=whatever");
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("a wrong address: error on the field, focus on it, the typed text is kept; nothing is stored", async ({ page }) => {
    submitsForms();
    await page.goto("/admin/login");
    const email = page.getByLabel("E-post");
    await email.fill("vale-aadress");
    await page.getByRole("button", { name: BUTTON }).click();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("Sisesta korrektne e-posti aadress.");
    await expect(email).toHaveValue("vale-aadress");
    await email.fill("");
    await page.getByRole("button", { name: BUTTON }).click();
    await expect(email).toBeFocused();
    await expect(page.locator("[data-login-status]")).toBeEmpty();
  });
});

for (const [address, name] of [
  ["maria@example.test", "Maria"],
  [" dim@example.test ", "Dim"],
] as const) {
  test(`${name}: the link from the e-mail signs in; the session lasts 30 days; logout ends it`, async ({ page, context, request, baseURL }) => {
    submitsForms();
    const { headers, body } = await requestLink(page, address);
    expect(headers["cache-control"]).toContain("no-store");
    // the neutral confirmation, announced in the status region, replaces the form
    const status = page.locator("[data-login-status]");
    await expect(status).toContainText(SENT);
    await expect(status).toContainText("15 minutit");
    await expect(status).toBeFocused();
    await expect(page.locator("[data-login-form]")).toBeHidden();

    await page.goto(pathOf(body.devLink!));
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Tere, ${name}.`);
    await expect(page.locator("html")).toHaveAttribute("lang", "et");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const cookie = (await sessionCookie(context))!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(30 * DAY - 120);
    expect(cookie.expires - Date.now() / 1000).toBeLessThanOrEqual(30 * DAY + 5);
    expect(await page.evaluate(() => document.cookie)).not.toContain("mslab_admin"); // HttpOnly
    expect(await sessionExists(cookie.value)).toBe(true);

    // still signed in after a reload and on the login page, which sends a signed-in admin on to the panel
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Tere, ${name}.`);
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin$/);

    // logout: POST from the button; the session row is deleted and the cookie cleared
    await page.getByRole("button", { name: "Logi välja" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect(await sessionCookie(context)).toBeUndefined();
    expect(await sessionExists(cookie.value)).toBe(false);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    // the old cookie value is dead even when presented again
    const replay = await request.get("/admin", { headers: { cookie: `mslab_admin=${cookie.value}` }, maxRedirects: 0 });
    expect([302, 303, 307]).toContain(replay.status());
    expect(new URL(replay.headers()["location"], baseURL!).pathname).toBe("/admin/login");
  });
}

test.describe("the link", () => {
  test("works once: a second opening, in any browser, is refused", async ({ page, context, browser, baseURL }) => {
    submitsForms();
    const { devLink, session } = await signIn(page, context, "dim@example.test");
    expect(await storedAuthTokens("dim@example.test")).toContainEqual({ used: true });
    // another browser: the used link gives it no session
    const second = await (await browser.newContext({ baseURL: baseURL! })).newPage();
    await second.goto(pathOf(devLink));
    await expect(second).toHaveURL(/\/admin\/login\?viga=link$/);
    await expect(second.locator("main").getByRole("alert")).toHaveText(LINK_ERROR);
    expect((await second.context().cookies()).find((c) => c.name === "mslab_admin")).toBeUndefined();
    await second.context().close();
    expect(await sessionExists(session)).toBe(true); // the first session was not touched
  });

  test("a HEAD request (mail scanner) does not use it up", async ({ page, context, request }) => {
    submitsForms();
    const { body } = await requestLink(page, "dim@example.test");
    const head = await request.head(pathOf(body.devLink!));
    expect(head.status()).toBe(405);
    await page.goto(pathOf(body.devLink!));
    await expect(page).toHaveURL(/\/admin$/);
    await sessionCookie(context);
  });

  test("expires after 15 minutes", async ({ page }) => {
    submitsForms();
    const { body } = await requestLink(page, "maria@example.test");
    await expireAuthToken(tokenOf(body.devLink!));
    await page.goto(pathOf(body.devLink!));
    await expect(page).toHaveURL(/\/admin\/login\?viga=link$/);
    await expect(page.locator("main").getByRole("alert")).toHaveText(LINK_ERROR);
  });

  test("an unknown or malformed token is refused without a session", async ({ page, context }) => {
    for (const t of ["nope", "A".repeat(43), ""]) {
      await page.goto(`/api/auth/verify?t=${t}`);
      await expect(page).toHaveURL(/\/admin\/login\?viga=link$/);
      await expect(page.locator("main").getByRole("alert")).toHaveText(LINK_ERROR);
    }
    await page.goto("/api/auth/verify");
    await expect(page).toHaveURL(/\/admin\/login\?viga=link$/);
    expect((await context.cookies()).find((c) => c.name === "mslab_admin")).toBeUndefined();
  });
});

test.describe("who can sign in", () => {
  test("an address outside the allow-list gets the same confirmation, no token row and no devLink", async ({ page }, info) => {
    submitsForms();
    const stranger = authTestEmail(info.project.name);
    const { status, body } = await requestLink(page, stranger);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    await expect(page.locator("[data-login-status]")).toContainText(SENT); // word for word what an allowed address sees
    await expect(page.locator("[data-login-status]")).toBeFocused();
    expect(await storedAuthTokens(stranger)).toEqual([]);
  });

  test("the allowed and the not allowed address see the same page text", async ({ page }, info) => {
    submitsForms();
    const text = async (address: string) => {
      await requestLink(page, address);
      return page.locator("[data-login-status]").innerText();
    };
    const allowed = await text("maria@example.test");
    const refused = await text(authTestEmail(info.project.name));
    expect(refused).toBe(allowed);
  });

  test("'Sisesta aadress uuesti' brings the form back with the typed address", async ({ page }, info) => {
    submitsForms();
    const stranger = authTestEmail(info.project.name);
    await requestLink(page, stranger);
    await page.getByRole("button", { name: "Sisesta aadress uuesti" }).click();
    await expect(page.locator("[data-login-form]")).toBeVisible();
    await expect(page.getByLabel("E-post")).toBeFocused();
    await expect(page.getByLabel("E-post")).toHaveValue(stranger);
  });
});

test.describe("limits", () => {
  test("5 requests per 10 minutes per visitor, then a polite message", async ({ page }, info) => {
    submitsForms();
    await page.goto("/admin/login");
    const stranger = authTestEmail(info.project.name);
    const statuses = await page.evaluate(async (address) => {
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await fetch("/api/auth/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: address }) });
        out.push(r.status);
      }
      return out;
    }, stranger);
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    await page.getByLabel("E-post").fill(stranger);
    await page.getByRole("button", { name: BUTTON }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toHaveText("Liiga palju katseid. Proovi mõne minuti pärast.");
    await expect(alert).toBeFocused();
    expect(await storedAuthTokens(stranger)).toEqual([]);
  });

  test("only JSON is accepted, and logout is POST only", async ({ request }) => {
    submitsForms();
    const form = await request.post("/api/auth/request", { form: { email: "dim@example.test" } });
    expect(form.status()).toBe(415);
    const get = await request.get("/api/auth/logout", { maxRedirects: 0 });
    expect(get.status()).toBe(405);
    const logout = await request.post("/api/auth/logout", { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(logout.status());
    expect(new URL(logout.headers()["location"], "http://x").pathname).toBe("/admin/login");
    expect(logout.headers()["set-cookie"]).toBeUndefined(); // no cookie sent, nothing to clear
  });
});
