// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DetailsTab } from "@/components/account/DetailsTab";
import { detailsTexts } from "@/components/account/texts";
import { ACCOUNT_EVENT } from "@/components/account/useAccount";
import { getDict, type Locale } from "@/i18n/locales";
import type { ClientProfile, Dashboard } from "@/server/client-data";

// "Minu andmed" in a browser-like document (happy-dom), with fetch answered here: the profile with one "Salvesta", the language
// change that opens the other language's tab, the newsletter switch that saves at once, and "Kustuta konto" with its step.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dashboard = (over: Partial<ClientProfile> = {}): Dashboard => ({
  client: { email: "kati@example.test", name: "Kati Tamm", phone: "", locale: "et", newsletter: false, ...over },
  cards: [],
  favourites: [],
  prepayment: null,
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector);
const sent = (path: string) => fetchMock.mock.calls.filter(([url, init]) => url === path && init?.method !== undefined && init.method !== "GET").map(([, init]) => JSON.parse(String(init?.body)));
const gets = () => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET");

const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  });
const click = async (el: Element | null) => {
  expect(el, "the element to click").not.toBeNull();
  await act(async () => (el as HTMLElement).click());
  await settle();
};
/** Types into a controlled input as a person would (React listens to the native input event). */
const type = async (input: HTMLInputElement | null, value: string) => {
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const submit = async () => {
  await act(async () => $<HTMLFormElement>("form")!.requestSubmit());
  await settle();
};
const mount = async (locale: Locale = "et") => {
  await act(async () => root.render(createElement(DetailsTab, { locale, t: detailsTexts(getDict(locale)) })));
  await settle();
};

/** The API: the dashboard for GET, `answers[path]` (default 200 { ok: true }) for the rest. */
function api(profile: Partial<ClientProfile> = {}, answers: Record<string, () => Promise<Response>> = {}) {
  fetchMock.mockImplementation(async (url, init) => {
    if ((init?.method ?? "GET") === "GET") return json(200, dashboard(profile));
    const answer = answers[String(url)];
    return answer ? answer() : json(200, { ok: true });
  });
}

let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  sessionStorage.clear();
  assign = vi.fn<(url: string | URL) => void>();
  vi.spyOn(window.location, "assign").mockImplementation(assign);
  window.history.replaceState(null, "", "/konto/andmed");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const nameField = () => $<HTMLInputElement>("input[name='name']");
const phoneField = () => $<HTMLInputElement>("input[name='phone']");
const status = () => $("[data-details-status]")?.textContent;

describe("the static shell", () => {
  test("renders the waiting look only: no field, no e-mail, no button", () => {
    const html = renderToStaticMarkup(createElement(DetailsTab, { locale: "et", t: detailsTexts(getDict("et")) }));
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/<input|<form|Kustuta konto|Salvesta|Sinu andmed/);
  });
});

describe("name, phone and language", () => {
  test("filled from the account; Salvesta sends them as one line each and says Salvestatud.; typing again takes the word away", async () => {
    api({ name: "Kati Tamm", phone: "+372 5555" });
    await mount();
    expect(gets().map(([url]) => url)).toEqual(["/api/konto"]);
    expect($("h1")?.textContent).toBe("Sinu andmed");
    expect($("[data-account-email]")?.textContent).toBe("E-postkati@example.test");
    expect(nameField()?.value).toBe("Kati Tamm");
    expect(phoneField()?.value).toBe("+372 5555");
    expect($<HTMLInputElement>("input[data-language='et']")?.checked).toBe(true);
    expect($("[data-details-status]")?.getAttribute("role")).toBe("status");

    await type(nameField(), "  Kati   Kask ");
    await submit();
    expect(sent("/api/konto/andmed")).toEqual([{ name: "Kati Kask", phone: "+372 5555", locale: "et" }]);
    expect(fetchMock.mock.calls.find(([url]) => url === "/api/konto/andmed")?.[1]?.method).toBe("PATCH");
    expect(status()).toBe("Salvestatud.");
    expect(nameField()?.value).toBe("Kati Kask");
    expect(assign).not.toHaveBeenCalled();
    await type(phoneField(), "");
    expect(status()).toBe("");
  });

  test("a failure says so; a 401 loads the page again", async () => {
    let answer = () => Promise.resolve(json(500, { ok: false, error: "server" }));
    api({}, { "/api/konto/andmed": () => answer() });
    await mount();
    await submit();
    expect(status()).toBe("Ei õnnestunud salvestada. Proovi uuesti.");
    expect($("[data-details-status]")?.className).toMatch(/error/);

    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    answer = () => Promise.resolve(json(401, { ok: false, reason: "none" }));
    await submit();
    expect(gets()).toHaveLength(2);
  });

  test("a new language is saved first, then the same tab opens in it with #salvestatud; the same language as the page stays", async () => {
    api();
    await mount();
    await click($("input[data-language='ru']"));
    await submit();
    expect(sent("/api/konto/andmed")).toEqual([{ name: "Kati Tamm", phone: "", locale: "ru" }]);
    expect(assign).toHaveBeenCalledWith("/ru/konto/andmed#salvestatud");
    expect(status()).toBe("");
    expect($("[data-details-save]")?.getAttribute("aria-disabled")).toBe("true"); // busy until the other page opens
  });

  test("an account in Russian on the Estonian page: saving without a change stays; choosing Estonian saves and stays (it is this page's language)", async () => {
    api({ locale: "ru" });
    await mount("et");
    expect($<HTMLInputElement>("input[data-language='ru']")?.checked).toBe(true);
    await submit();
    expect(assign).not.toHaveBeenCalled();
    await click($("input[data-language='et']"));
    await submit();
    expect(sent("/api/konto/andmed").map((b) => b.locale)).toEqual(["ru", "et"]);
    expect(assign).not.toHaveBeenCalled();
    expect(status()).toBe("Salvestatud.");
  });

  test("opened with #salvestatud (after a language change): Сохранено. once, and the fragment is gone", async () => {
    window.history.replaceState(null, "", "/ru/konto/andmed#salvestatud");
    api({ locale: "ru" });
    await mount("ru");
    expect($("h1")?.textContent).toBe("Ваши данные");
    expect(status()).toBe("Сохранено.");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/ru/konto/andmed");
  });
});

describe("Saada mulle uudiskirja", () => {
  test("a switch that saves at once with its own line, not with Salvesta; a failure puts it back", async () => {
    let answer = () => Promise.resolve(json(200, { ok: true }));
    api({}, { "/api/konto/uudiskiri": () => answer() });
    await mount();
    const sw = () => $<HTMLInputElement>("input[role='switch']")!;
    expect(sw().checked).toBe(false);
    expect(sw().closest("label")?.textContent).toBe("Saada mulle uudiskirja");
    await click(sw());
    expect(sent("/api/konto/uudiskiri")).toEqual([{ on: true }]);
    expect(sw().checked).toBe(true);
    expect($("[data-details-newsletter-status]")?.textContent).toBe("Salvestatud.");
    expect(status()).toBe("");
    expect(sent("/api/konto/andmed")).toEqual([]);

    answer = () => Promise.resolve(json(500, { ok: false }));
    await click(sw());
    expect(sent("/api/konto/uudiskiri")).toEqual([{ on: true }, { on: false }]);
    expect(sw().checked).toBe(true);
    expect($("[data-details-newsletter-status]")?.textContent).toBe("Ei õnnestunud salvestada. Proovi uuesti.");
  });
});

describe("Kustuta konto", () => {
  test("quiet text at the very bottom; the step takes the focus, Tühista and Esc give it back", async () => {
    api();
    await mount();
    const del = () => $("[data-delete-account]");
    const controls = [...document.querySelectorAll("[data-account-details] button, [data-account-details] input")];
    expect(controls.at(-1)).toBe(del());
    expect(del()?.textContent).toBe("Kustuta konto");
    expect(del()?.className).not.toMatch(/btn/);

    await click(del());
    const step = $("[data-delete-confirm]");
    expect(document.activeElement).toBe(step);
    expect(step?.getAttribute("role")).toBe("group");
    expect($(`#${CSS.escape(step!.getAttribute("aria-labelledby")!)}`)?.textContent).toBe("Kas kustutame su konto? Sinu registreeringud jäävad Mariale alles.");
    expect([...step!.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Jah, kustuta", "Tühista"]);
    expect(document.querySelector("dialog")).toBeNull();

    await click($("[data-delete-no]"));
    expect($("[data-delete-confirm]")).toBeNull();
    expect(document.activeElement).toBe(del());

    await click(del());
    await act(async () => $("[data-delete-confirm]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await settle();
    expect($("[data-delete-confirm]")).toBeNull();
    expect(document.activeElement).toBe(del());
    expect(sent("/api/konto/kustuta")).toEqual([]);
  });

  test("Jah, kustuta: one POST { confirm: true }; this browser forgets the account, the header is told, and the home page opens with #konto-kustutatud", async () => {
    api();
    await mount();
    localStorage.setItem("mslab-email", "kati@example.test");
    localStorage.setItem("mslab-fav", '["x"]'); // the browser's own list (not the account's) stays
    sessionStorage.setItem("mslab-login-code", JSON.stringify({ sentTo: "kati@example.test", sentAt: Date.now() }));
    localStorage.setItem("mslab-account-fav", '["kulmude-lami"]');
    sessionStorage.setItem("mslab-change-sent", JSON.stringify([{ id: 1, startsAt: "2026-12-01T08:00:00.000Z", at: Date.now() }]));
    const told = vi.fn();
    window.addEventListener(ACCOUNT_EVENT, told);
    await click($("[data-delete-account]"));
    await click($("[data-delete-yes]"));
    window.removeEventListener(ACCOUNT_EVENT, told);
    expect(sent("/api/konto/kustuta")).toEqual([{ confirm: true }]);
    expect(localStorage.getItem("mslab-email")).toBeNull();
    expect(sessionStorage.getItem("mslab-login-code")).toBeNull();
    expect(localStorage.getItem("mslab-account-fav")).toBeNull();
    expect(sessionStorage.getItem("mslab-change-sent")).toBeNull();
    expect(localStorage.getItem("mslab-fav")).toBe('["x"]');
    expect(told).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/#konto-kustutatud");
  });

  test("Russian: the home page is /ru", async () => {
    api({ locale: "ru" });
    await mount("ru");
    await click($("[data-delete-account]"));
    expect($("[data-delete-confirm]")?.textContent).toContain("Удалить ваш личный кабинет? Ваши регистрации останутся у\u00a0Марии.");
    await click($("[data-delete-yes]"));
    expect(assign).toHaveBeenCalledWith("/ru#konto-kustutatud");
  });

  test("a failure says so and keeps the step (nothing forgotten); a 401 loads the page again", async () => {
    let answer = () => Promise.resolve(json(500, { ok: false, error: "server" }));
    api({}, { "/api/konto/kustuta": () => answer() });
    await mount();
    localStorage.setItem("mslab-email", "kati@example.test");
    await click($("[data-delete-account]"));
    await click($("[data-delete-yes]"));
    expect($("[data-delete-failed]")?.textContent).toBe("Kustutamine ei õnnestunud. Proovi uuesti.");
    expect($("[data-delete-failed]")?.getAttribute("role")).toBe("alert");
    expect($("[data-delete-confirm]")).not.toBeNull();
    expect(localStorage.getItem("mslab-email")).toBe("kati@example.test");
    expect(assign).not.toHaveBeenCalled();

    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    answer = () => Promise.resolve(json(401, { ok: false, reason: "none" }));
    await click($("[data-delete-yes]"));
    expect(gets()).toHaveLength(2);
  });
});
