// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NewsletterForm, type NewsletterFormTexts } from "@/components/site/NewsletterForm";

// The newsletter sign-up form (phase 2c Task 7), shared by the footer card, the coming-soon page and the home page's newsletter popup:
// the markup of the real form and of the admin's picture of it (`preview`), the line under the button and who it is read out on, and
// `onSent` (the popup remembers a sign-up). The subscribe action is answered here.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ subscribe: vi.fn<(formData: FormData) => Promise<unknown>>() }));
vi.mock("@/server/actions/public", () => ({ subscribe: mocks.subscribe }));

const t: NewsletterFormTexts = {
  emailLabel: "Sinu e-post",
  emailPlaceholder: "nimi@e-post.ee",
  submit: "Liitu",
  notice: "Liitudes saad MS LABi uudiskirja. Saad igal ajal loobuda.",
  privacy: "Privaatsus",
  sentTitle: "",
  sentText: "Saatsime sulle kinnituslingi. Ava see oma postkastis.",
  errorEmail: "Sisesta korrektne e-posti aadress.",
  errorTooMany: "Liiga palju katseid.",
  errorGeneric: "Midagi läks valesti.",
};

let container: HTMLDivElement;
let root: Root;
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector);
const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  });
const markup = (props: Partial<Parameters<typeof NewsletterForm>[0]> = {}) => renderToStaticMarkup(createElement(NewsletterForm, { locale: "et", t, ...props }));

beforeEach(() => {
  mocks.subscribe.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("the form's markup", () => {
  test("a real <form>: e-mail, the button, one line under it (read out on the button) with the privacy link, and the honeypot", () => {
    const html = markup();
    expect(html).toMatch(/<form\b[^>]*\bmethod="post"/);
    expect(html).toMatch(/<form\b[^>]*data-newsletter-form/);
    expect(html).toContain('name="website"'); // the honeypot
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).not.toContain('type="checkbox"');
    expect(html.match(/data-newsletter-notice/g)).toHaveLength(1); // one <p>, with or without the link
    expect(html).not.toContain("noticeAlone"); // that class is for the line without the link
    const noticeId = /<p[^>]*id="([^"]+-notice)"[^>]*data-newsletter-notice|<p[^>]*data-newsletter-notice[^>]*id="([^"]+-notice)"/.exec(html);
    const id = noticeId?.[1] ?? noticeId?.[2];
    expect(id, "the line has an id").toBeTruthy();
    // signing up is the consent: a screen reader hears it on the button; the e-mail field is described by its error only
    expect(html).toMatch(new RegExp(`<button[^>]*aria-describedby="${id}"`));
    expect(html).not.toMatch(new RegExp(`<input[^>]*name="email"[^>]*aria-describedby="${id}"`));
    expect(html).toContain('<a href="/privaatsus">Privaatsus</a>');
  });

  test("without the privacy link (the coming-soon page) the line stands alone, still one <p>", () => {
    const html = markup({ privacyLink: false });
    expect(html.match(/data-newsletter-notice/g)).toHaveLength(1);
    expect(html).not.toContain("<a ");
    expect(html).toContain("noticeAlone");
    expect(html).toContain("Saad igal ajal loobuda.");
    expect(html).not.toContain("Privaatsus");
  });

  test("Russian: the link is in the Russian site", () => {
    expect(markup({ locale: "ru", t: { ...t, privacy: "Конфиденциальность" } })).toContain('<a href="/ru/privaatsus">Конфиденциальность</a>');
  });

  test("the admin's picture (preview): a plain block, no <form>, no honeypot, a button that submits nothing, the privacy word as a span that looks like the link", () => {
    const html = markup({ preview: true });
    expect(html).not.toContain("<form");
    expect(html).toContain("<div data-newsletter-form");
    expect(html).not.toContain('name="website"');
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain("<a "); // a click in the editor never leaves unsaved work
    expect(html).toContain("Liitudes saad MS LABi uudiskirja. Saad igal ajal loobuda.");
    // the word is not a link but has the link's look (Newsletter.module.css: `.notice a` and `.privacyWord` are one rule), so the picture is as tall as the popup
    expect(html).toMatch(/<span class="[^"]*privacyWord[^"]*">Privaatsus<\/span>/);
    expect(html.match(/data-newsletter-notice/g)).toHaveLength(1);
    // the real form has the link and no such span
    expect(markup()).not.toContain("privacyWord");
  });

  test("the picture without the privacy link (privacyLink off) has no word either", () => {
    const html = markup({ preview: true, privacyLink: false });
    expect(html).not.toContain("privacyWord");
    expect(html).not.toContain("Privaatsus");
  });
});

describe("sending", () => {
  const mount = async (props: Partial<Parameters<typeof NewsletterForm>[0]> = {}) => {
    await act(async () => root.render(createElement(NewsletterForm, { locale: "et", t, ...props })));
    await settle();
  };
  const type = async (input: HTMLInputElement | null, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const submit = async () => {
    await act(async () => $<HTMLFormElement>("form")!.requestSubmit());
    await settle();
  };

  test("the address goes to the subscribe action; the answer takes the form's place, with no heading when sentTitle is empty, and onSent is told once", async () => {
    mocks.subscribe.mockResolvedValue({ ok: true });
    const onSent = vi.fn();
    await mount({ onSent });
    await type($<HTMLInputElement>("input[name='email']"), "kati@example.test");
    expect(onSent).not.toHaveBeenCalled();
    await submit();
    const sent = mocks.subscribe.mock.calls[0][0];
    expect([sent.get("email"), sent.get("locale"), sent.get("website")]).toEqual(["kati@example.test", "et", ""]);
    expect($("[data-newsletter-status]")?.textContent).toBe("Saatsime sulle kinnituslingi. Ava see oma postkastis.");
    expect($("[data-newsletter-status] h3")).toBeNull();
    expect($("form")).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
    await settle();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  test("with a sentTitle the answer has its heading", async () => {
    mocks.subscribe.mockResolvedValue({ ok: true });
    await mount({ t: { ...t, sentTitle: "Kontrolli oma postkasti" } });
    await type($<HTMLInputElement>("input[name='email']"), "kati@example.test");
    await submit();
    expect($("[data-newsletter-status] h3")?.textContent).toBe("Kontrolli oma postkasti");
  });

  test("a refused address: the error is on the e-mail field (which keeps its value and its error description), the button keeps the line; onSent is not told", async () => {
    mocks.subscribe.mockResolvedValue({ ok: false, errors: { email: "invalid" } });
    const onSent = vi.fn();
    await mount({ onSent });
    const email = $<HTMLInputElement>("input[name='email']")!;
    await type(email, "vale-aadress");
    await submit();
    expect($("[role='alert']")?.textContent).toBe("Sisesta korrektne e-posti aadress.");
    expect(email.value).toBe("vale-aadress");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toMatch(/-error$/);
    expect($("button")?.getAttribute("aria-describedby")).toMatch(/-notice$/);
    expect(onSent).not.toHaveBeenCalled();
  });
});
