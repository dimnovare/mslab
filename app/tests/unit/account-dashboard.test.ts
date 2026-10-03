import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AccountShell } from "@/components/account/AccountShell";
import { CoursesTab } from "@/components/account/CoursesTab";
import { forgetChangeRequests, rememberChangeRequest, SENT_KEY, sentChangeRequests } from "@/components/account/sent-requests";
import { coursesTexts, shellTexts } from "@/components/account/texts";
import type { AccountCard } from "@/domain/account-cards";
import { getDict, type Locale } from "@/i18n/locales";
import type { Dashboard } from "@/server/client-data";

// "Minu koolitused" (phase 2a Task 6) as the server renders it: the static /konto shell (the same for every visitor, no
// personal data), and the admin's read-only "view as client" (Task 9), which renders the same components with the
// client's dashboard and every action disabled.

const NOW = "2026-10-03T10:00:00.000Z";
const FUTURE = "2026-11-14T08:00:00.000Z"; // 14.11 at 10:00 Estonian time
const course = { slug: "kulmude-lami", title: { et: "Kulmude lamineerimine", ru: "Ламинирование бровей" } };
const ecourse = { slug: "kulmumeistri-e-koolitus", title: { et: "Kulmumeistri e-koolitus" } };

const cards: AccountCard[] = [
  { kind: "contact", registrationId: 7, course, session: { startsAt: FUTURE, city: "Pärnu", venue: "Salong", cancelled: false }, status: "awaiting_prepayment", paymentChoice: "half", priceCents: 35000, paidCents: 0, createdAt: NOW },
  { kind: "contact", registrationId: 8, course, session: { startsAt: FUTURE, city: "Pärnu", venue: "Salong", cancelled: false }, status: "confirmed", paymentChoice: "full", priceCents: 35000, paidCents: 35000, createdAt: NOW },
  { kind: "ecourse", course: ecourse, grantedAt: NOW, expiresAt: "2027-04-03T10:00:00.000Z", revoked: false },
  { kind: "request", requestId: 3, requestKind: "practice", title: { et: "MINI" }, detail: "Tööpäeviti pärast kella 17", handled: false, createdAt: NOW },
  { kind: "contact", registrationId: 9, course, session: { startsAt: FUTURE, city: "Pärnu", venue: "Salong", cancelled: false }, status: "cancelled", paymentChoice: "full", priceCents: 35000, paidCents: 0, createdAt: NOW },
];

const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  client: { email: "kati@example.test", name: "Kati Tamm", phone: "", locale: "et", newsletter: false },
  cards,
  favourites: [],
  prepayment: { receiver: "MS LAB OÜ", iban: "EE00 0000 0000 0000 0000", bank: "Pank", referencePrefix: "MS" },
  ...over,
});

/** AccountShell with its children given as createElement's third argument. */
const Shell = AccountShell as (props: Omit<ComponentProps<typeof AccountShell>, "children">) => ReturnType<typeof AccountShell>;

function render(locale: Locale, opts: { data?: Dashboard; readOnly?: boolean; banner?: string } = {}): string {
  const d = getDict(locale);
  const children = createElement(CoursesTab, { locale, t: coursesTexts(d), data: opts.data, readOnly: opts.readOnly, now: NOW });
  return renderToStaticMarkup(createElement(Shell, { tab: "courses", locale, t: shellTexts(d), readOnly: opts.readOnly, banner: opts.banner }, children));
}

/** Every opening tag of an element in the markup. */
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];

describe("the static /konto shell", () => {
  test("the tabs, the menu button and two skeleton cards; nothing about any visitor", () => {
    const html = render("et");
    expect(html).toContain('data-account-tabs="top"');
    expect(html).toContain('data-account-tabs="bottom"');
    for (const [label, to] of [["Minu koolitused", "/konto"], ["Lemmikud", "/konto/lemmikud"], ["Minu andmed", "/konto/andmed"]])
      expect(html).toMatch(new RegExp(`<a [^>]*href="${to}"[^>]*>.*?${label}`));
    const current = tags(html, "a").filter((a) => a.includes('href="/konto"'));
    expect(current).toHaveLength(2); // top and bottom
    for (const a of current) expect(a).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Minu konto"'); // the menu button
    expect(html.match(/data-card-skeleton/g)).toHaveLength(2);
    expect(html).toContain("Laadin koolitusi…");
    expect(html).not.toContain("data-card=");
    expect(html).not.toContain("Tere");
  });

  test("in Russian, the tabs point at the Russian pages", () => {
    const html = render("ru");
    expect(html).toMatch(/<a [^>]*href="\/ru\/konto\/lemmikud"[^>]*>.*?Избранное/);
    expect(html).toContain("Загружаем курсы…");
  });
});

describe("the dashboard with its data", () => {
  test("the greeting with the first name, the one line, each card's sentence and its one button", () => {
    const html = render("et", { data: dashboard() });
    expect(html).toContain(">Tere, Kati!</h1>");
    expect(html).toContain("Siin on sinu koolitused.");
    expect(html).toContain("Koha kinnitamiseks tasu ettemaks 175 €.");
    expect(html).toContain("Koht on kinnitatud. Kohtume 14.11 kell 10:00, Pärnu.");
    expect(html).toContain("Ligipääs kuni 03.04.2027.");
    expect(html).toContain("Päring on saadetud. Maria vastab peagi.");
    expect(html).toContain("Registreering on tühistatud.");
    expect(html).toContain('data-card-action="pay"');
    expect(html).toContain('data-card-action="change"');
    expect(tags(html, "a").filter((a) => a.includes('data-card-action="open"'))).toEqual([expect.stringContaining('href="/konto/kursus/kulmumeistri-e-koolitus"')]);
    // at most one button per card
    for (const card of html.split("<article").slice(1)) expect(card.match(/data-card-action=/g)?.length ?? 0).toBeLessThanOrEqual(1);
    // ahead and over: the chips
    expect(html).toContain('data-account-filters=""');
    expect(html).toMatch(/aria-pressed="true"[^>]*data-filter="all"/);
  });

  test("no name: Tere!", () => {
    expect(render("et", { data: dashboard({ client: { ...dashboard().client, name: "" } }) })).toContain(">Tere!</h1>");
  });

  test("no cards: one sentence and Vaata koolitusi → the catalogue of the page's language", () => {
    const et = render("et", { data: dashboard({ cards: [] }) });
    expect(et).toContain("Sul ei ole veel koolitusi.");
    expect(et).toMatch(/<a [^>]*href="\/koolitused"[^>]*>Vaata koolitusi/);
    expect(et).not.toContain("data-account-filters");
    const ru = render("ru", { data: dashboard({ cards: [] }) });
    expect(ru).toContain("У вас пока нет курсов.");
    expect(ru).toMatch(/<a [^>]*href="\/ru\/koolitused"[^>]*>Посмотреть курсы/);
  });
});

describe("read-only (the admin's view as client)", () => {
  const html = render("et", { data: dashboard(), readOnly: true, banner: "Vaatad kliendi Kati Tamm vaadet — muuta ei saa" });

  test("the banner, the frame and the same cards", () => {
    expect(html).toContain("Vaatad kliendi Kati Tamm vaadet — muuta ei saa");
    expect(html).toContain('data-account-tabs="top"');
    expect(html).toContain("Koha kinnitamiseks tasu ettemaks 175 €.");
    expect(html).toContain("Ligipääs kuni 03.04.2027.");
  });

  test("every link is aria-disabled and leads nowhere: the tabs, Ava koolitus", () => {
    const links = tags(html, "a");
    expect(links.length).toBeGreaterThanOrEqual(7); // 3 tabs × 2, Ava koolitus
    for (const a of links) {
      expect(a).toContain('aria-disabled="true"');
      expect(a).not.toContain("href=");
    }
  });

  test("every button that would act is aria-disabled (pay, change request, the menu); only the filter chips work", () => {
    const buttons = tags(html, "button").filter((b) => !b.includes("data-filter="));
    expect(buttons.map((b) => /data-(card-action|account-menu)="?([a-z]*)/.exec(b)?.slice(1).join(":"))).toEqual(
      expect.arrayContaining(["card-action:pay", "card-action:change", "account-menu:"]),
    );
    for (const b of buttons) expect(b).toContain('aria-disabled="true"');
    expect(html).not.toContain("data-account-logout"); // the menu never opens, so "Logi välja" is not there at all
  });

  test("an empty dashboard's Vaata koolitusi is disabled too", () => {
    const empty = render("et", { data: dashboard({ cards: [] }), readOnly: true });
    for (const a of tags(empty, "a")) expect(a).toContain('aria-disabled="true"');
  });
});

describe("the sent change requests of this tab (sessionStorage)", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("kept per registration, forgotten on logout", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    expect(sentChangeRequests()).toEqual([]);
    rememberChangeRequest(8);
    rememberChangeRequest(8);
    rememberChangeRequest(12);
    expect(sentChangeRequests()).toEqual([8, 12]);
    store.set(SENT_KEY, '[8, "x", 1.5, 3]');
    expect(sentChangeRequests()).toEqual([8, 3]);
    store.set(SENT_KEY, "{not json");
    expect(sentChangeRequests()).toEqual([]);
    forgetChangeRequests();
    expect(store.has(SENT_KEY)).toBe(false);
  });

  test("blocked storage keeps nothing and throws nothing", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(sentChangeRequests()).toEqual([]);
    expect(() => rememberChangeRequest(1)).not.toThrow();
    expect(() => forgetChangeRequests()).not.toThrow();
  });
});
