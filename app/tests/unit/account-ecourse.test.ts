// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EcoursePage } from "@/components/account/EcoursePage";
import { ecourseTexts } from "@/components/account/texts";
import { formatDate } from "@/i18n/format";
import { getDict, type Locale } from "@/i18n/locales";
import type { EcourseView } from "@/server/client-data";

// The e-course page in a browser-like document (happy-dom), with fetch answered here: no access, the terms notice, accepting
// (and what is sent), a 409 when the admin saved new terms meanwhile, the other failures, and the course view itself.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EXPIRES = "2027-03-22T08:00:00.000Z";
const V1 = "2026-10-01T09:00:00.000Z";
const V2 = "2026-10-03T09:30:00.000Z";
const view = (over: { accepted?: boolean; version?: string; text?: EcourseView["terms"]["text"] } = {}): EcourseView => ({
  course: {
    slug: "veebikursus",
    title: { et: "Veebikursus", ru: "Онлайн-курс" },
    modules: [{ id: 1, title: { et: "Sissejuhatus", ru: "Введение" }, lessons: [] }, { id: 2, title: { et: "Praktika" }, lessons: [] }],
  },
  access: { expiresAt: EXPIRES },
  terms: { version: over.version ?? V1, accepted: over.accepted ?? false, text: over.accepted ? null : "text" in over ? (over.text ?? null) : { et: "Esimene lõik.\n\nTeine lõik.", ru: "Первый абзац." } },
  progress: { done: 0, total: 0, next: null },
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const $ = (selector: string) => document.querySelector(selector);
const $$ = (selector: string) => [...document.querySelectorAll(selector)];

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  });
const click = async (el: Element | null) => {
  expect(el, "the element to click").not.toBeNull();
  await act(async () => (el as HTMLElement).click());
  await settle();
};
const mount = async (locale: Locale = "et") => {
  await act(async () => root.render(createElement(EcoursePage, { slug: "veebikursus", locale, t: ecourseTexts(getDict(locale)) })));
  await settle();
};
const tick = (box = $("input[name='terms']")) => click(box);
const button = () => $("[data-terms-gate] button[type='submit']") as HTMLButtonElement;
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("the static shell", () => {
  test("renders the skeleton only: no personal text, no notice, no course", () => {
    const html = renderToStaticMarkup(createElement(EcoursePage, { slug: "veebikursus", locale: "et", t: ecourseTexts(getDict("et")) }));
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/Enne alustamist|Ligipääs|ligipääsu|data-terms|data-ecourse/);
  });
});

describe("without access (the API's 404)", () => {
  test("says so in one sentence with one button to the public course page, and is not the error state", async () => {
    fetchMock.mockResolvedValue(json(404, { ok: false }));
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/konto/kursus/veebikursus");
    const state = $("[data-account-state='noAccess']")!;
    expect(state.querySelector("h1")?.textContent).toBe("Sul ei ole sellele koolitusele ligipääsu.");
    expect([...state.querySelectorAll("a, button")].map((e) => e.textContent)).toEqual(["Vaata koolitust"]);
    expect(state.querySelector("a")?.getAttribute("href")).toBe("/koolitused/veebikursus");
    expect($("[data-account-state='error']")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Proovi uuesti|Ei õnnestunud/);
  });

  test("Russian: the same, linking to /ru/koolitused/<slug>", async () => {
    fetchMock.mockResolvedValue(json(404, { ok: false }));
    await mount("ru");
    const state = $("[data-account-state='noAccess']")!;
    expect(state.querySelector("h1")?.textContent).toBe("У\u00a0вас нет доступа к\u00a0этому курсу.");
    expect(state.querySelector("a")?.textContent).toBe("Посмотреть курс");
    expect(state.querySelector("a")?.getAttribute("href")).toBe("/ru/koolitused/veebikursus");
  });

  test("a 404 that is not the API's own answer (the platform's HTML page) is the error with its retry button, never the no-access sentence", async () => {
    fetchMock.mockResolvedValue(new Response("<html>404 This page could not be found</html>", { status: 404, headers: { "content-type": "text/html" } }));
    await mount();
    expect($("[data-account-state='error']")).not.toBeNull();
    expect($("[data-account-state='noAccess']")).toBeNull();
    expect(document.body.textContent).not.toContain("ligipääsu");
  });

  test("a server error is still the error with its retry button, never the no-access sentence", async () => {
    fetchMock.mockResolvedValue(json(500, { ok: false }));
    await mount();
    expect($("[data-account-state='error']")).not.toBeNull();
    expect($("[data-account-state='noAccess']")).toBeNull();
    expect(document.body.textContent).toContain("Ei õnnestunud laadida.");
  });
});

describe("the terms notice", () => {
  test("title, the text as paragraphs, one checkbox and one button that stays off until the box is ticked", async () => {
    fetchMock.mockResolvedValue(json(200, view()));
    await mount();
    const gate = $("[data-terms-gate]")!;
    expect(gate.querySelector("h1")?.textContent).toBe("Enne alustamist");
    expect($$("[data-terms-text] [data-legal-body] p").map((p) => p.textContent)).toEqual(["Esimene lõik.", "Teine lõik."]);
    expect(gate.querySelectorAll("input[type='checkbox']")).toHaveLength(1);
    expect(gate.querySelector("label")?.textContent).toBe("Olen tutvunud ja nõustun tingimustega");
    expect(gate.querySelectorAll("button, a")).toHaveLength(1);
    expect(button().textContent).toBe("Alusta koolitust");
    expect(button().disabled).toBe(true);
    expect($("[data-ecourse]")).toBeNull();
    await tick();
    expect(button().disabled).toBe(false);
    await tick();
    expect(button().disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing was sent
  });

  test("Russian shows the Russian text; a missing Russian text shows the Estonian one", async () => {
    fetchMock.mockResolvedValue(json(200, view()));
    await mount("ru");
    expect($("[data-terms-gate] h1")?.textContent).toBe("Перед началом");
    expect($$("[data-legal-body] p").map((p) => p.textContent)).toEqual(["Первый абзац."]);
    expect(button().textContent).toBe("Начать обучение");
    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockResolvedValue(json(200, view({ text: { et: "Ainult eesti." } })));
    await mount("ru");
    expect($$("[data-legal-body] p").map((p) => p.textContent)).toEqual(["Ainult eesti."]);
  });

  test("no terms text stored: the server says nothing is left to accept, so the course opens at once: no notice, nothing sent", async () => {
    fetchMock.mockResolvedValue(json(200, view({ accepted: true })));
    await mount();
    expect($("[data-terms-gate]")).toBeNull();
    expect($("[data-ecourse]")).not.toBeNull();
    expect(posts()).toHaveLength(0);
  });

  test("a notice that is somehow sent without its text still shows its title, box and button", async () => {
    fetchMock.mockResolvedValue(json(200, view({ text: null })));
    await mount();
    expect($("[data-terms-text]")).toBeNull();
    expect($("[data-terms-gate] h1")?.textContent).toBe("Enne alustamist");
    expect(button().disabled).toBe(true);
  });

  test("an accepted version goes straight to the course: no notice, nothing sent", async () => {
    fetchMock.mockResolvedValue(json(200, view({ accepted: true })));
    await mount();
    expect($("[data-terms-gate]")).toBeNull();
    expect($("[data-ecourse]")).not.toBeNull();
    expect(posts()).toHaveLength(0);
    expect(document.activeElement).toBe(document.body); // nothing steals the focus on a plain visit
  });
});

describe("accepting", () => {
  test("sends { slug, version } of the shown text, then shows the course with the focus on its title; nothing is loaded again", async () => {
    fetchMock.mockImplementation(async (_input, init) => (init?.method === "POST" ? json(200, { ok: true }) : json(200, view())));
    await mount();
    await tick();
    await click(button());
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe("/api/konto/tingimused");
    expect(posts()[0][1]).toMatchObject({ method: "POST", credentials: "same-origin", body: JSON.stringify({ slug: "veebikursus", version: V1 }) });
    expect(fetchMock).toHaveBeenCalledTimes(2); // the page and the acceptance

    expect($("[data-terms-gate]")).toBeNull();
    const h1 = $("[data-ecourse] h1")!;
    expect(h1.textContent).toBe("Veebikursus");
    expect(document.activeElement).toBe(h1);
    expect($("[data-ecourse-access]")?.textContent).toBe(`Ligipääs kuni ${formatDate(new Date(EXPIRES), "et")}`);
    expect($("[data-ecourse-access]")?.textContent).toBe("Ligipääs kuni 22.03.2027");
    expect($$("[data-modules] li").map((li) => li.querySelector("span:nth-child(2)")?.textContent)).toEqual(["Sissejuhatus", "Praktika"]);
    expect($$("[data-modules] [data-locked]")).toHaveLength(2);
    expect($("[data-ecourse-soon]")?.textContent).toBe("Sisu lisandub peagi.");
  });

  test("Russian course view: the Russian title, module, date line and sentence", async () => {
    fetchMock.mockResolvedValue(json(200, view({ accepted: true })));
    await mount("ru");
    expect($("[data-ecourse] h1")?.textContent).toBe("Онлайн-курс");
    expect($("[data-ecourse-access]")?.textContent).toBe("Доступ до 22.03.2027");
    expect($$("[data-modules] li").map((li) => li.querySelector("span:nth-child(2)")?.textContent)).toEqual(["Введение", "Praktika"]);
    expect($("[data-ecourse-soon]")?.textContent).toBe("Материалы скоро появятся.");
  });

  test("two quick presses send one request", async () => {
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementation((_input, init) => (init?.method === "POST" ? new Promise<Response>((resolve) => (answer = resolve)) : Promise.resolve(json(200, view()))));
    await mount();
    await tick();
    await act(async () => {
      button().click();
      button().click();
    });
    expect(posts()).toHaveLength(1);
    expect(button().getAttribute("aria-disabled")).toBe("true"); // sending
    await act(async () => answer(json(200, { ok: true })));
    await settle();
    expect($("[data-ecourse]")).not.toBeNull();
  });

  test("a 409 (new terms were saved meanwhile): the page is loaded again quietly, the new text shows with the box cleared and no message", async () => {
    let loads = 0;
    let answerReload: (r: Response) => void = () => {};
    fetchMock.mockImplementation((_input, init) => {
      if (init?.method === "POST") return Promise.resolve(json(409, { ok: false, error: "version" }));
      loads++;
      if (loads === 1) return Promise.resolve(json(200, view()));
      return new Promise<Response>((resolve) => (answerReload = resolve));
    });
    await mount();
    await tick();
    await click(button());
    expect(posts()[0][1]).toMatchObject({ body: JSON.stringify({ slug: "veebikursus", version: V1 }) });
    // while the new answer is on its way the notice stays (no skeleton), still sending, no message; the box is cleared by the new notice
    expect($("[data-account-state='loading']")).toBeNull();
    expect($("[data-terms-gate]")).not.toBeNull();
    expect(($("input[name='terms']") as HTMLInputElement).checked).toBe(true);
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect($("[data-terms-failed]")?.textContent).toBe("");
    await act(async () => answerReload(json(200, view({ version: V2, text: { et: "Uus tekst." } }))));
    await settle();

    expect(loads).toBe(2);
    expect($("[data-terms-gate]")?.getAttribute("data-terms-version")).toBe(V2);
    expect($$("[data-legal-body] p").map((p) => p.textContent)).toEqual(["Uus tekst."]);
    expect(($("input[name='terms']") as HTMLInputElement).checked).toBe(false);
    expect(button().disabled).toBe(true);
    expect($("[data-terms-failed]")?.textContent).toBe("");
    expect(document.body.textContent).not.toMatch(/Ei õnnestunud|Proovi uuesti/);
    expect(document.activeElement).toBe($("[data-terms-gate] h1")); // a screen reader hears that the text changed

    // accepting the new text sends the new version
    fetchMock.mockImplementation(async (_input, init) => (init?.method === "POST" ? json(200, { ok: true }) : json(200, view({ version: V2 }))));
    await tick();
    await click(button());
    expect(posts()[1][1]).toMatchObject({ body: JSON.stringify({ slug: "veebikursus", version: V2 }) });
    expect($("[data-ecourse]")).not.toBeNull();
  });

  test.each([
    ["a server error", () => Promise.resolve(json(500, { ok: false }))],
    ["no answer", () => Promise.reject(new TypeError("network"))],
    ["a platform 404 page", () => Promise.resolve(new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } }))],
    ["an empty answer", () => Promise.resolve(json(200, null))],
  ])("a 409 whose reload fails (%s): the plain sentence, the box still ticked, pressing again asks again", async (_name, failure) => {
    let loads = 0;
    fetchMock.mockImplementation((_input, init) => {
      if (init?.method === "POST") return Promise.resolve(json(409, { ok: false, error: "version" }));
      return ++loads === 1 ? Promise.resolve(json(200, view())) : failure();
    });
    await mount();
    await tick();
    await click(button());
    expect(loads).toBe(2);
    expect($("[data-terms-failed]")?.textContent).toBe("Ei õnnestunud salvestada. Proovi uuesti.");
    expect(($("input[name='terms']") as HTMLInputElement).checked).toBe(true); // not cleared silently
    expect(button().disabled).toBe(false);
    expect(button().getAttribute("aria-disabled")).toBeNull();
    expect($("[data-terms-gate]")?.getAttribute("data-terms-version")).toBe(V1);
    // the focus is not taken to the title of a notice that never came
    expect(document.activeElement).not.toBe($("[data-terms-gate] h1"));

    // pressed again once the server answers: the new notice, the box empty, no sentence
    fetchMock.mockImplementation((_input, init) => Promise.resolve(init?.method === "POST" ? json(409, { ok: false, error: "version" }) : json(200, view({ version: V2, text: { et: "Uus tekst." } }))));
    await click(button());
    expect($("[data-terms-gate]")?.getAttribute("data-terms-version")).toBe(V2);
    expect(($("input[name='terms']") as HTMLInputElement).checked).toBe(false);
    expect($("[data-terms-failed]")?.textContent).toBe("");
  });

  test.each([
    ["a platform's 404 page", () => new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } })],
    ["a proxy's 409 page", () => new Response("<html>conflict</html>", { status: 409, headers: { "content-type": "text/html" } })],
    ["a sign-in page's 401", () => new Response("<html>sign in</html>", { status: 401, headers: { "content-type": "text/html" } })],
    ["JSON that is not the API's 404", () => json(404, { message: "not found" })],
  ])("%s on accepting is a failure, not a changed version: the sentence, the box ticked, no page load", async (_name, answer) => {
    fetchMock.mockImplementation(async (_input, init) => (init?.method === "POST" ? answer() : json(200, view())));
    await mount();
    await tick();
    await click(button());
    expect(fetchMock).toHaveBeenCalledTimes(2); // the page and the acceptance: nothing loaded again
    expect($("[data-terms-failed]")?.textContent).toBe("Ei õnnestunud salvestada. Proovi uuesti.");
    expect(($("input[name='terms']") as HTMLInputElement).checked).toBe(true);
    expect(button().disabled).toBe(false);
  });

  test("a 409 whose reload finds the new version already accepted goes to the course", async () => {
    let loads = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") return json(409, { ok: false, error: "version" });
      return json(200, ++loads === 1 ? view() : view({ version: V2, accepted: true }));
    });
    await mount();
    await tick();
    await click(button());
    expect($("[data-terms-gate]")).toBeNull();
    expect($("[data-ecourse]")).not.toBeNull();
  });

  test("access that ended meanwhile (404 on accepting): the page says there is no access", async () => {
    let loads = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") return json(404, { ok: false, error: "slug" });
      return ++loads === 1 ? json(200, view()) : json(404, { ok: false });
    });
    await mount();
    await tick();
    await click(button());
    expect($("[data-account-state='noAccess']")).not.toBeNull();
    expect($("[data-terms-gate]")).toBeNull();
  });

  test("signed out or replaced while reading (401 on accepting): the page is loaded again and says so", async () => {
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    let loads = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") return json(401, { ok: false, reason: "replaced" });
      return ++loads === 1 ? json(200, view()) : json(401, { ok: false, reason: "replaced" });
    });
    await mount();
    await tick();
    await click(button());
    expect($("[data-account-state='replaced']")).not.toBeNull();
  });

  test.each([
    ["a server error", () => Promise.resolve(json(500, { ok: false }))],
    ["no answer", () => Promise.reject(new TypeError("network"))],
    ["a refused request", () => Promise.resolve(json(403, { ok: false }))],
    ["a 200 that is not ok", () => Promise.resolve(json(200, { ok: false }))],
  ])("%s: one plain sentence, the box stays ticked, and pressing again works", async (_name, failure) => {
    fetchMock.mockImplementation((_input, init) => (init?.method === "POST" ? failure() : Promise.resolve(json(200, view()))));
    await mount();
    await tick();
    await click(button());
    expect($("[data-terms-failed]")?.textContent).toBe("Ei õnnestunud salvestada. Proovi uuesti.");
    expect(($("input[name='terms']") as HTMLInputElement).checked).toBe(true);
    expect(button().disabled).toBe(false);
    expect(button().getAttribute("aria-disabled")).toBeNull();
    expect($("[data-terms-gate]")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // no reload for a plain failure

    fetchMock.mockImplementation(async (_input, init) => (init?.method === "POST" ? json(200, { ok: true }) : json(200, view())));
    await click(button());
    expect($("[data-ecourse]")).not.toBeNull();
  });

  test("the failure sentence in Russian", async () => {
    fetchMock.mockImplementation((_input, init) => (init?.method === "POST" ? Promise.resolve(json(500, {})) : Promise.resolve(json(200, view()))));
    await mount("ru");
    await tick();
    await click(button());
    expect($("[data-terms-failed]")?.textContent).toBe("Не удалось сохранить. Попробуйте ещё раз.");
  });
});
