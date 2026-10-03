import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { LoginForm } from "@/components/account/LoginForm";
import { hasAccountHint, hintIn } from "@/components/account/useAccount";
import { AccountLink } from "@/components/site/AccountLink";
import { getDict } from "@/i18n/locales";

// The client account in the browser (phase 2a Task 5): the hint cookie, and what the static shells render on the server —
// the same for every visitor, whoever is signed in (the browser fills in the rest after hydration).

describe("the sign-in hint cookie (mslab_in=1)", () => {
  test("is read from a Cookie string, exactly", () => {
    expect(hintIn("mslab_in=1")).toBe(true);
    expect(hintIn("a=b; mslab_in=1; c=d")).toBe(true);
    expect(hintIn(" mslab_in=1 ")).toBe(true);
    for (const cookie of ["", "mslab_in=0", "mslab_in=", "xmslab_in=1", "mslab_in=11", "__Host-mslab_client=abc"]) expect(hintIn(cookie), cookie).toBe(false);
  });

  test("is false on the server (no document)", () => {
    expect(hasAccountHint()).toBe(false);
  });
});

describe("the static shells' server rendering", () => {
  test("the header button says Logi sisse and goes to the login page; Minu konto takes the same space, hidden", () => {
    for (const [locale, login, account, to] of [["et", "Logi sisse", "Minu konto", "/konto/sisene"], ["ru", "Войти", "Мой кабинет", "/ru/konto/sisene"]] as const) {
      const html = renderToStaticMarkup(createElement(AccountLink, { locale, login, account, className: "x" }));
      expect(html).toContain(`href="${to}"`);
      expect(html).toContain('data-account-link="out"');
      expect(html).toContain(`<span aria-hidden="false">${login}</span>`);
      expect(html).toContain(`<span aria-hidden="true">${account}</span>`);
    }
  });

  test("the login page starts at the e-mail step: an empty field, Saada kood, nothing about any visitor", () => {
    const d = getDict("et");
    const html = renderToStaticMarkup(createElement(LoginForm, { locale: "et", t: { ...d.account.login, title: d.nav.login, badEmail: d.forms.errorEmail } }));
    expect(html).toContain('data-login-step="email"');
    expect(html).toContain(">Logi sisse</h1>");
    expect(html).toContain(">E-post</label>");
    expect(html).toMatch(/<input[^>]*type="email"[^>]*value=""/);
    expect(html).toContain("Saada kood");
    expect(html).toContain('method="post"');
    expect(html).not.toContain("data-login-banner"); // ?viga is read in the browser
    expect(html).not.toContain("one-time-code");
  });
});
