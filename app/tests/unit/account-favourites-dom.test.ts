// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FavouritesTab } from "@/components/account/FavouritesTab";
import { favouritesTexts } from "@/components/account/texts";
import type { CourseCardData } from "@/components/site/CourseCard";
import { getDict, type Locale } from "@/i18n/locales";

// "Lemmikud" in a browser-like document (happy-dom), with fetch answered here: the cards, ♡ that takes one off in place (the focus,
// what a screen reader hears, this tab's copy), a failure, a session that has ended, and the browser's own favourites merged in
// after the page loaded.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const card = (slug: string, title: string): { slug: string; card: CourseCardData } => ({
  slug,
  card: {
    id: slug.length, type: "contact", href: `/koolitused/${slug}`, title, summary: "Kokkuvõte.", image: "", imageAlt: title, badge: null,
    tags: ["Kontaktõpe"], meta: { lead: "05.12", text: "Tartu" }, price: "220 €",
  },
});
const LAMI = card("kulmude-lami", "Kulmude LAMI");
const BOTOX = card("lash-lift-botox", "Lash Lift BOTOX");
const answer = (...cards: ReturnType<typeof card>[]) => ({ ok: true, favourites: cards.map((c) => c.slug), cards });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const $ = (selector: string) => document.querySelector(selector);
const $$ = (selector: string) => [...document.querySelectorAll(selector)];
const gets = () => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET");
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  });
const click = async (el: Element | null) => {
  expect(el, "the element to click").not.toBeNull();
  await act(async () => (el as HTMLElement).click());
  await settle();
};
const mount = async (locale: Locale = "et") => {
  await act(async () => root.render(createElement(FavouritesTab, { locale, t: favouritesTexts(getDict(locale)) })));
  await settle();
};
const removeButton = (slug: string) => $(`[data-favourite-remove="${slug}"]`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "mslab_in=1; path=/"; // signed in, as the page's answers say (the copy is kept only then)
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.cookie = "mslab_in=; path=/; max-age=0";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the static shell", () => {
  test("renders the waiting look only: no heading, no card, no personal text", () => {
    const html = renderToStaticMarkup(createElement(FavouritesTab, { locale: "et", t: favouritesTexts(getDict("et")) }));
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/Sinu lemmikud|Eemalda|data-favourite-card|data-favourites-empty/);
  });
});

describe("the list", () => {
  test("loads the page's language and shows the catalogue's cards, each with ♡ named for its course; this tab keeps the list", async () => {
    fetchMock.mockResolvedValue(json(200, answer(LAMI, BOTOX)));
    await mount();
    expect(gets().map(([url]) => url)).toEqual(["/api/konto/lemmikud?l=et"]);
    expect($("h1")?.textContent).toBe("Sinu lemmikud");
    expect($$("[data-favourite-card]").map((e) => e.getAttribute("data-favourite-card"))).toEqual(["kulmude-lami", "lash-lift-botox"]);
    expect($("[data-favourite-card='kulmude-lami'] [data-course-card]")?.getAttribute("href")).toBe("/koolitused/kulmude-lami");
    expect(removeButton("kulmude-lami")?.getAttribute("aria-label")).toBe("Eemalda lemmikutest: Kulmude LAMI");
    expect(removeButton("kulmude-lami")?.textContent).toBe("Eemalda lemmikutest");
    expect(localStorage.getItem("mslab-account-fav")).toBe('["kulmude-lami","lash-lift-botox"]');
    expect(posts()).toEqual([]);
  });

  test("Russian: asks for the Russian cards and says it in Russian", async () => {
    fetchMock.mockResolvedValue(json(200, answer()));
    await mount("ru");
    expect(gets()[0][0]).toBe("/api/konto/lemmikud?l=ru");
    expect($("h1")?.textContent).toBe("Ваше избранное");
    expect($("[data-favourites-empty]")?.textContent).toContain("Добавляйте курсы в\u00a0избранное ♡ на странице курса.");
    expect($("[data-favourites-empty] a")?.getAttribute("href")).toBe("/ru/koolitused");
  });

  test("♡ takes a card off in place: one POST, the next card's ♡ gets the focus, a screen reader hears it, this tab's copy follows; the last leaves the empty state", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method !== "POST") return json(200, answer(LAMI, BOTOX));
      const { slug } = JSON.parse(String(init.body)) as { slug: string };
      return json(200, { ok: true, favourites: slug === LAMI.slug ? [BOTOX.slug] : [] });
    });
    await mount();
    const list = $("[data-account-favourites]");
    await click(removeButton("kulmude-lami"));
    expect(posts().map(([url, init]) => [url, JSON.parse(String(init?.body))])).toEqual([["/api/konto/lemmikud", { slug: "kulmude-lami", on: false }]]);
    expect($$("[data-favourite-card]").map((e) => e.getAttribute("data-favourite-card"))).toEqual(["lash-lift-botox"]);
    expect($("[data-account-favourites]")).toBe(list); // the same page: no reload, no skeleton
    expect(document.activeElement).toBe(removeButton("lash-lift-botox"));
    expect($("[data-favourites-status]")?.textContent).toBe("Eemaldatud lemmikutest: Kulmude LAMI");
    expect(localStorage.getItem("mslab-account-fav")).toBe('["lash-lift-botox"]');
    expect(gets()).toHaveLength(1);

    await click(removeButton("lash-lift-botox"));
    expect($$("[data-favourite-card]")).toHaveLength(0);
    expect($("[data-favourites-empty]")?.textContent).toContain("Lisa koolitus lemmikuks ♡ koolituse lehel.");
    expect([...document.querySelectorAll("[data-favourites-empty] a")].map((a) => a.textContent)).toEqual(["Vaata koolitusi"]);
    expect(document.activeElement).toBe($("h1"));
    expect(gets()).toHaveLength(1);
  });

  test("the last card in the list: the focus goes to the ♡ before it", async () => {
    fetchMock.mockImplementation(async (_url, init) => (init?.method === "POST" ? json(200, { ok: true, favourites: [LAMI.slug] }) : json(200, answer(LAMI, BOTOX))));
    await mount();
    await click(removeButton("lash-lift-botox"));
    expect(document.activeElement).toBe(removeButton("kulmude-lami"));
  });

  test.each([
    ["500", () => Promise.resolve(json(500, { ok: false, error: "server" }))],
    ["no answer", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["200 without a list", () => Promise.resolve(json(200, { ok: true }))],
  ])("%s: the card stays and says so under it", async (_name, failure) => {
    fetchMock.mockImplementation(async (_url, init) => (init?.method === "POST" ? failure() : json(200, answer(LAMI, BOTOX))));
    await mount();
    await click(removeButton("kulmude-lami"));
    expect($$("[data-favourite-card]")).toHaveLength(2);
    expect($("[data-favourite-card='kulmude-lami']")?.textContent).toContain("Ei õnnestunud eemaldada. Proovi uuesti.");
    expect($("[data-favourite-card='lash-lift-botox']")?.textContent).not.toContain("Ei õnnestunud");
    expect(localStorage.getItem("mslab-account-fav")).toBe('["kulmude-lami","lash-lift-botox"]');
  });

  test("a session that has ended (401) loads the page again, which then says so", async () => {
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    let n = 0;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") return json(401, { ok: false, reason: "none" });
      return n++ === 0 ? json(200, answer(LAMI)) : json(401, { ok: false, reason: "none" });
    });
    await mount();
    await click(removeButton("kulmude-lami"));
    expect(gets()).toHaveLength(2);
    expect(replace).toHaveBeenCalledWith("/konto/sisene");
  });

  test("the browser's own favourites, merged in after the page loaded, show without reloading the page", async () => {
    localStorage.setItem("mslab-fav", JSON.stringify([BOTOX.slug]));
    let merged = false;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST" && url === "/api/konto/lemmikud/merge") {
        merged = true;
        return json(200, { ok: true, favourites: [BOTOX.slug, LAMI.slug] });
      }
      return json(200, merged ? answer(BOTOX, LAMI) : answer(LAMI));
    });
    await mount();
    expect(posts().map(([url]) => url)).toEqual(["/api/konto/lemmikud/merge"]);
    expect(gets()).toHaveLength(2);
    expect($$("[data-favourite-card]").map((e) => e.getAttribute("data-favourite-card"))).toEqual(["lash-lift-botox", "kulmude-lami"]);
    expect(localStorage.getItem("mslab-fav")).toBeNull();
    expect($("[aria-busy='true']")).toBeNull(); // a quiet reload: no waiting look in between
  });
});
