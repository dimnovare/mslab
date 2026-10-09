// @vitest-environment happy-dom
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FlashNotice, type FlashMessage } from "@/components/site/FlashNotice";
import type { NewsletterPopupTexts } from "@/components/site/NewsletterPopup";

// The home page's newsletter popup next to the confirmation notice (phase 2c final fix): the confirmation link lands on
// /?uudiskiri=kinnitatud#kood=…, where the popup must not open over the notice with her code, and the browser remembers she is signed up.
// The page renders FlashNotice before the popup, and FlashNotice takes the parameter out of the address in its own effect, which runs
// before the popup's: so the popup reads the address in its first render. Both are rendered here in the page's order.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
  interface Window {
    __mslabCampaignDelay?: number;
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/server/actions/public", () => ({ subscribe: vi.fn() }));

const notices: Record<string, FlashMessage> = {
  kinnitatud: { tone: "ok", title: "Uudiskiri on kinnitatud", codeLine: "Sinu kood: {code}" },
  vigane: { tone: "warn", title: "Link on vigane" },
  viga: { tone: "warn", title: "Midagi läks valesti." },
};
const t: NewsletterPopupTexts = {
  close: "Sulge",
  form: {
    emailLabel: "Sinu e-post",
    emailPlaceholder: "nimi@e-post.ee",
    submit: "Liitu",
    notice: "Liitudes saad MS LABi uudiskirja.",
    privacy: "Privaatsus",
    sentTitle: "",
    sentText: "Saatsime sulle kinnituslingi.",
    errorEmail: "Sisesta korrektne e-posti aadress.",
    errorTooMany: "Liiga palju katseid.",
    errorGeneric: "Midagi läks valesti.",
  },
};
const view = { image: "", kicker: "MS LABi kirjad", title: "Hea järgmine samm.", text: "Uued koolitused." };

let container: HTMLDivElement;
let root: Root;
const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const address = () => window.location.pathname + window.location.search + window.location.hash;
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

/** The home page's two parts in its order (the notice, then the popup), freshly loaded at `at`: a new document, so the popup's once-per-load state is new. */
async function loadHome(at: string) {
  vi.resetModules();
  const { NewsletterPopup } = await import("@/components/site/NewsletterPopup");
  window.history.replaceState(null, "", at);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(
        Fragment,
        null,
        createElement(FlashNotice, { param: "uudiskiri", notices, closeLabel: "Sulge" }),
        createElement(NewsletterPopup, { n: view, locale: "et", t }),
      ),
    ),
  );
}
const leave = async () => {
  await act(async () => root.unmount());
  container.remove();
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.__mslabCampaignDelay = 30; // the e2e's short delay, in place of D's 6 s
});
afterEach(async () => {
  await leave();
  delete window.__mslabCampaignDelay;
  window.history.replaceState(null, "", "/");
});

describe("the newsletter popup on the home page", () => {
  test("a plain visit: it opens after the delay (and remembers nothing yet)", async () => {
    await loadHome("/");
    expect($("[data-newsletter-popup]")).toBeNull();
    await wait(200);
    expect($("[data-newsletter-popup]")).not.toBeNull();
    expect(localStorage.getItem("mslab-nl")).toBeNull();
  });

  test("the confirmed landing (?uudiskiri=kinnitatud#kood=…): the notice with her code, and no popup over it, however long she stays; this browser is marked signed up", async () => {
    await loadHome("/?uudiskiri=kinnitatud#kood=TERE10");
    await wait(300);
    expect($("[data-flash-notice]")?.textContent).toContain("Sinu kood: TERE10");
    expect($("[data-newsletter-popup]")).toBeNull();
    expect(sessionStorage.getItem("mslab-camp")).toBeNull(); // the popup did not even use up the session's turn
    expect(localStorage.getItem("mslab-nl")).toBe("1");
    expect(address()).toBe("/"); // FlashNotice took the parameter and the code out, as before
  });

  test("a reload of / in the same browser, and a visit from a new session: still none (she is signed up here)", async () => {
    await loadHome("/?uudiskiri=kinnitatud");
    await wait(150);
    await leave();
    sessionStorage.clear(); // a new browser session
    await loadHome("/");
    await wait(300);
    expect($("[data-newsletter-popup]")).toBeNull();
  });

  test.each(["vigane", "viga", "mingi-muu", ""])("any other landing (?uudiskiri=%s) shows no popup on that page load either, and marks nothing", async (value) => {
    await loadHome(`/?uudiskiri=${value}`);
    await wait(300);
    expect($("[data-newsletter-popup]")).toBeNull();
    expect(localStorage.getItem("mslab-nl")).toBeNull();
    // the next page load is an ordinary one
    await leave();
    await loadHome("/");
    await wait(200);
    expect($("[data-newsletter-popup]")).not.toBeNull();
  });

  test("other query parameters do not stop it", async () => {
    await loadHome("/?utm_source=x");
    await wait(200);
    expect($("[data-newsletter-popup]")).not.toBeNull();
  });

  test("signed up from the popup before (mslab-nl): none, as before", async () => {
    localStorage.setItem("mslab-nl", "1");
    await loadHome("/");
    await wait(200);
    expect($("[data-newsletter-popup]")).toBeNull();
  });
});
