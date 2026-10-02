import { randomBytes } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { signInAsAdmin, type CreatedRows } from "./admin-login";
import { removeAdminRows } from "./fixtures";
import { revalidateLocalPages } from "./local-cache";
import { PROD_BUILD } from "./target";
import { test, expect } from "./test";

// The database client and every per-request value belong to one Worker request (server/per-request.ts): a burst of
// signed-in admin pages, one after another and side by side, with public pages rendered from the database at the same
// time, all answer, and none uses a client another request has closed. On 02.10.2026 the live Worker answered about a
// quarter of the admin pages with a 500 ("[auth] session lookup failed: … CONNECTION_ENDED").
//
// Local production build only (E2E_PROD_BUILD): it signs in by writing to the local database, and the Worker entry
// (worker.ts) with its request scope runs only there. What broke the live Worker was a CPU-limit kill in the middle of
// a render (Workers Free), which `wrangler dev` does not enforce; that state is covered by tests/unit/request-scope.test.ts
// and tests/db/request-scope.test.ts. This spec checks the request scope under load on the real build.

test.skip(!PROD_BUILD, "the Worker entry and its request scope run in the local production build only (E2E_PROD_BUILD=1)");
test.skip(({ isMobile }) => isMobile, "the same answers for every browser: desktop project only");

const ADMIN_PAGES = [
  "/admin",
  "/admin/avaleht",
  "/admin/kalender",
  "/admin/kampaania",
  "/admin/koolitaja",
  "/admin/koolitused",
  "/admin/paringud",
  "/admin/praktika",
  "/admin/registreerimised",
  "/admin/seaded",
  "/admin/uudised",
  "/admin/uudiskiri",
];

/**
 * Public pages that no other spec expects from the cache front: each is marked stale (its path tag) right before it is
 * asked for, so the request renders it from the database. [address, the path the app renders].
 */
const PUBLIC_PAGES: [string, string][] = [
  ["/ru/koolitaja", "/ru/koolitaja"],
  ["/ru/praktika", "/ru/praktika"],
  ["/ru/uudised", "/ru/uudised"],
  ["/ru/kontakt", "/ru/kontakt"],
  ["/privaatsus", "/et/privaatsus"],
  ["/tingimused", "/et/tingimused"],
];

const created: CreatedRows = { tokens: new Set<string>(), sessions: new Set<string>() };

test.afterAll(async () => {
  await removeAdminRows(created);
});

type Answer = { path: string; status: number; note: string };

async function adminGet(request: APIRequestContext, cookie: string, path: string): Promise<Answer> {
  const res = await request.get(path, { headers: { cookie }, maxRedirects: 0, failOnStatusCode: false });
  const html = await res.text();
  // the admin shell, rendered for the signed-in admin (a failed session lookup is a 500, a lost session a redirect)
  return { path, status: res.status(), note: res.status() === 200 && !html.includes('href="#main"') ? "no admin shell" : "" };
}

async function publicRender(request: APIRequestContext, [path, rendered]: [string, string]): Promise<Answer> {
  await revalidateLocalPages(`_N_T_${rendered}`);
  const res = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
  await res.body();
  const cache = res.headers()["x-page-cache"] ?? "";
  return { path, status: res.status(), note: cache === "front" ? "served from the cache, not rendered" : "" };
}

/** The newsletter link with a token nobody has: one SELECT; "viga" would mean the database failed. */
async function confirmLink(request: APIRequestContext): Promise<Answer> {
  const res = await request.get(`/api/newsletter/confirm?t=${randomBytes(32).toString("base64url")}`, { maxRedirects: 0, failOnStatusCode: false });
  const outcome = new URL(res.headers()["location"] ?? "/", "http://x").searchParams.get("uudiskiri");
  return { path: "/api/newsletter/confirm", status: res.status(), note: outcome === "vigane" ? "" : `uudiskiri=${outcome}` };
}

const failures = (answers: Answer[], ok: (a: Answer) => boolean) => answers.filter((a) => !ok(a) || a.note).map((a) => `${a.path}: ${a.status} ${a.note}`.trim());

test("signed-in admin pages one after another and side by side, with public renders between them: every answer is right", async ({ page, context, request }) => {
  test.setTimeout(240_000);
  await signInAsAdmin(page, context, "", created);
  const session = (await context.cookies()).find((c) => c.name === "__Host-mslab_admin")!.value;
  const cookie = `__Host-mslab_admin=${session}`;

  const admin: Answer[] = [];
  const pub: Answer[] = [];
  for (let i = 0; i < 40; i++) admin.push(await adminGet(request, cookie, ADMIN_PAGES[i % ADMIN_PAGES.length]));
  for (let round = 0; round < 10; round++) {
    const [answers, publicAnswers, link] = await Promise.all([
      Promise.all([0, 1, 2, 3].map((j) => adminGet(request, cookie, ADMIN_PAGES[(round * 4 + j) % ADMIN_PAGES.length]))),
      Promise.all([0, 1].map((j) => publicRender(request, PUBLIC_PAGES[(round * 2 + j) % PUBLIC_PAGES.length]))),
      confirmLink(request),
    ]);
    admin.push(...answers);
    pub.push(...publicAnswers, link);
  }

  expect(admin).toHaveLength(80);
  expect(failures(admin, (a) => a.status === 200), "admin pages").toEqual([]);
  expect(failures(pub, (a) => (a.path === "/api/newsletter/confirm" ? a.status === 303 : a.status === 200)), "public answers").toEqual([]);
});
