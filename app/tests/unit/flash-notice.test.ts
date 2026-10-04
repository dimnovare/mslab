// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FlashNotice, type FlashMessage } from "@/components/site/FlashNotice";

// The home page's notice after a redirect (components/site/FlashNotice.tsx): the newsletter link's ?uudiskiri=…, and an account
// page's fragment (#konto-kustutatud after the account was deleted). The page is cached for everyone: the server renders only the
// empty region; the browser reads the address once, shows the notice and takes the parameter or the fragment out of the address.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const notices: Record<string, FlashMessage> = {
  kinnitatud: { tone: "ok", title: "Uudiskiri on kinnitatud", text: "Aitäh!" },
  vigane: { tone: "warn", title: "Link on vigane" },
};
const fragments: Record<string, FlashMessage> = { "konto-kustutatud": { tone: "ok", title: "Konto on kustutatud." } };

let container: HTMLDivElement;
let root: Root;
const region = () => document.querySelector("[data-flash-notice]")!;
const address = () => window.location.pathname + window.location.search + window.location.hash;

async function show(at: string, withFragments = true) {
  window.history.replaceState(null, "", at);
  await act(async () =>
    root.render(createElement(FlashNotice, { param: "uudiskiri", notices, ...(withFragments ? { fragments } : {}), closeLabel: "Sulge" })),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

describe("FlashNotice", () => {
  test("the server renders the empty polite region only", () => {
    const html = renderToStaticMarkup(createElement(FlashNotice, { param: "uudiskiri", notices, fragments, closeLabel: "Sulge" }));
    expect(html).toContain('role="status"');
    expect(html).toContain('data-flash-notice=""');
    expect(html).not.toMatch(/kustutatud|kinnitatud/);
  });

  test("a fragment notice (#konto-kustutatud) shows once and the fragment is cleared; the rest of the address stays", async () => {
    await show("/ru?utm=x#konto-kustutatud");
    expect(region().getAttribute("data-flash-notice")).toBe("ok");
    expect(region().textContent).toContain("Konto on kustutatud.");
    expect(address()).toBe("/ru?utm=x");
    // shown again (a re-render, or the page opened again without the fragment): no notice of its own
    await act(async () => root.unmount());
    root = createRoot(container);
    await show(address());
    expect(region().textContent).toBe("");
  });

  test("an unknown fragment (a plain anchor such as #main) is left alone and shows nothing", async () => {
    await show("/#main");
    expect(region().textContent).toBe("");
    expect(region().getAttribute("data-flash-notice")).toBe("");
    expect(address()).toBe("/#main");
  });

  test("the ?uudiskiri path is as before: the notice, the parameter taken out, a fragment kept", async () => {
    await show("/?uudiskiri=kinnitatud&utm=x#main");
    expect(region().getAttribute("data-flash-notice")).toBe("ok");
    expect(region().textContent).toContain("Uudiskiri on kinnitatud");
    expect(region().textContent).toContain("Aitäh!");
    expect(address()).toBe("/?utm=x#main");
  });

  test("an unknown ?uudiskiri value is taken out of the address and shows nothing; a page without fragments ignores one", async () => {
    await show("/?uudiskiri=mis");
    expect(region().textContent).toBe("");
    expect(address()).toBe("/");
    await act(async () => root.unmount());
    root = createRoot(container);
    await show("/#konto-kustutatud", false);
    expect(region().textContent).toBe("");
    expect(address()).toBe("/#konto-kustutatud");
  });

  test("closing it removes it", async () => {
    await show("/#konto-kustutatud");
    await act(async () => (region().querySelector("button[aria-label='Sulge']") as HTMLButtonElement).click());
    expect(region().textContent).toBe("");
  });
});
