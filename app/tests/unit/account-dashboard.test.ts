import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AccountShell } from "@/components/account/AccountShell";
import { CoursesTab } from "@/components/account/CoursesTab";
import { forgetChangeRequests, isSent, pruneChangeRequests, rememberChangeRequest, SENT_KEY, SENT_TTL_MS, sentChangeRequests } from "@/components/account/sent-requests";
import { coursesTexts, shellTexts } from "@/components/account/texts";
import type { AccountCard, ContactCard } from "@/domain/account-cards";
import { getDict, type Locale } from "@/i18n/locales";
import type { Dashboard } from "@/server/client-data";

// "Minu koolitused" (phase 2a Task 6) as the server renders it: the static /konto shell (the same for every visitor, no
// personal data), and the admin's read-only "view as client" (Task 9), which renders the same components with the
// client's dashboard and every action disabled. (A click on the read-only view: account-readonly.test.ts.)

const NOW = "2026-10-03T10:00:00.000Z";
const FUTURE = "2026-11-14T08:00:00.000Z"; // 14.11 at 10:00 Estonian time
const PAST = "2026-09-20T07:00:00.000Z";
const course = { slug: "kulmude-lami", title: { et: "Kulmude lamineerimine", ru: "Ламинирование бровей" } };
const ecourse = { slug: "kulmumeistri-e-koolitus", title: { et: "Kulmumeistri e-koolitus" } };
const session = (startsAt = FUTURE) => ({ startsAt, city: "Pärnu", venue: "Salong", cancelled: false });

const contact = (registrationId: number, over: Partial<ContactCard> = {}): ContactCard => ({
  kind: "contact", registrationId, course, session: session(), status: "confirmed", paymentChoice: "full", priceCents: 35000, paidCents: 35000, createdAt: NOW, ...over,
});

const cards: AccountCard[] = [
  contact(7, { status: "awaiting_prepayment", paymentChoice: "half", paidCents: 0 }),
  contact(8),
  { kind: "ecourse", course: ecourse, grantedAt: NOW, expiresAt: "2027-04-03T10:00:00.000Z", revoked: false },
  { kind: "request", requestId: 3, requestKind: "practice", title: { et: "MINI" }, detail: "Tööpäeviti pärast kella 17", handled: false, createdAt: NOW },
  contact(9, { status: "cancelled", paidCents: 0 }),
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
  const t = coursesTexts(d);
  const children = opts.data
    ? createElement(CoursesTab, { locale, t, data: opts.data, readOnly: opts.readOnly, now: NOW })
    : createElement(CoursesTab, { locale, t, now: NOW });
  return renderToStaticMarkup(createElement(Shell, { tab: "courses", locale, t: shellTexts(d), readOnly: opts.readOnly, banner: opts.banner }, children));
}

/** Every opening tag of an element in the markup. */
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];

/** One card's markup, by its data-card key. */
function cardHtml(html: string, key: string): string {
  const start = html.indexOf(`data-card="${key}"`);
  expect(start, key).toBeGreaterThan(0);
  return html.slice(start, html.indexOf("</article>", start));
}

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
    expect(tags(html, "button").filter((b) => b.includes("data-account-menu"))).toEqual([expect.stringContaining('aria-label="Konto menüü"')]);
    expect(html.match(/data-card-skeleton/g)).toHaveLength(2);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Laadin koolitusi…");
    expect(html).not.toContain("data-card=");
    expect(html).not.toContain("Tere");
  });

  test("in Russian, the tabs point at the Russian pages", () => {
    const html = render("ru");
    expect(html).toMatch(/<a [^>]*href="\/ru\/konto\/lemmikud"[^>]*>.*?Избранное/);
    expect(html).toContain('aria-label="Меню кабинета"');
    expect(html).toContain("Загружаем курсы…");
  });
});

describe("the dashboard with its data", () => {
  test("the greeting with the first name, the one line, each card's sentence and its one button", () => {
    const html = render("et", { data: dashboard() });
    expect(html).toContain(">Tere, Kati!</h1>");
    expect(html).toContain("Siin on sinu koolitused.");
    expect(html).toContain("Koha kinnitamiseks tasu ettemaks 175 €.");
    expect(cardHtml(html, "registration-8")).toContain('data-next-step="confirmed">Koht on kinnitatud.</p>');
    expect(cardHtml(html, "registration-8")).toContain("14.11.2026 · 10:00"); // the date line says when, the sentence does not
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
    // two or more ahead: on a phone a row to swipe, which the keyboard can scroll
    expect(tags(html, "ul")).toEqual([expect.stringMatching(/tabindex="0"[^>]*data-account-cards="swipe"|data-account-cards="swipe"[^>]*tabindex="0"/)]);
  });

  test("every other state of a card: its sentence, and a button only where there is something to do", () => {
    const more: AccountCard[] = [
      contact(20, { paidCents: 17500 }), // confirmedRest
      contact(21, { status: "awaiting_prepayment", paymentChoice: "half", paidCents: 17500 }), // confirming
      contact(22, { session: session(PAST) }), // done
      { kind: "ecourse", course: { slug: "x", title: { et: "Vana e-koolitus" } }, grantedAt: PAST, expiresAt: PAST, revoked: false }, // accessEnded
      { kind: "individual", registrationId: 23, course, status: "awaiting_prepayment", preferredPeriod: "november", createdAt: NOW }, // individualPending
      { kind: "request", requestId: 24, requestKind: "individual", title: null, detail: "", handled: true, createdAt: NOW }, // requestDone
    ];
    const html = render("et", { data: dashboard({ cards: more }) });
    const expected: [string, string, string, string | null][] = [
      ["registration-20", "confirmedRest", "Koht on kinnitatud. Ülejäänud 175 € tasud koolituspäeval.", "change"],
      ["registration-21", "confirming", "Makse on laekunud. Maria kinnitab su koha.", null],
      ["registration-22", "done", "Koolitus on toimunud. Aitäh!", null],
      ["course-x", "accessEnded", "Ligipääs on lõppenud.", null],
      ["registration-23", "individualPending", "Maria võtab sinuga ühendust, et aeg kokku leppida.", null],
      ["request-24", "requestDone", "Maria on päringule vastanud.", null],
    ];
    for (const [key, step, sentence, action] of expected) {
      const card = cardHtml(html, key);
      expect(card, key).toContain(`data-next-step="${step}">${sentence}</p>`);
      expect(card.match(/data-card-action="(\w+)"/)?.[1] ?? null, key).toBe(action);
    }
    expect(cardHtml(html, "registration-23")).toContain("november"); // the preferred period on the date line
    expect(cardHtml(html, "request-24")).toContain("Individuaalkoolitus"); // a request whose course is gone
  });

  test("prepayment instructions without a receiver or an IBAN: Maria sends an invoice, no button", () => {
    const html = render("et", { data: dashboard({ prepayment: { receiver: "", iban: "", bank: "Swedbank", referencePrefix: "MS" } }) });
    expect(cardHtml(html, "registration-7")).toContain('data-next-step="invoice">Maria saadab sulle arve ettemaksu tasumiseks.</p>');
    expect(cardHtml(html, "registration-7")).not.toContain("data-card-action");
  });

  test("no name: Tere!", () => {
    expect(render("et", { data: dashboard({ client: { ...dashboard().client, name: "" } }) })).toContain(">Tere!</h1>");
  });

  test("no cards: the greeting, one sentence and Vaata koolitusi → the catalogue of the page's language; no line, no chips", () => {
    const et = render("et", { data: dashboard({ cards: [] }) });
    expect(et).toContain("Sul ei ole veel koolitusi.");
    expect(et).not.toContain("Siin on sinu koolitused.");
    expect(et).toMatch(/<a [^>]*href="\/koolitused"[^>]*>Vaata koolitusi/);
    expect(et).not.toContain("data-account-filters");
    const ru = render("ru", { data: dashboard({ cards: [] }) });
    expect(ru).toContain("У вас пока нет курсов.");
    expect(ru).not.toContain("Здесь ваши курсы.");
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

  const T0 = Date.parse(NOW);
  const fakeStorage = () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    return store;
  };

  test("kept per registration and session date for 24 hours, forgotten on logout", () => {
    const store = fakeStorage();
    expect(sentChangeRequests(T0)).toEqual([]);
    rememberChangeRequest(contact(8), T0);
    rememberChangeRequest(contact(8), T0 + 1000); // again: one entry, the newer
    rememberChangeRequest(contact(12), T0);
    expect(sentChangeRequests(T0 + 1000)).toEqual([
      { id: 8, startsAt: FUTURE, at: T0 + 1000 },
      { id: 12, startsAt: FUTURE, at: T0 },
    ]);
    const list = sentChangeRequests(T0 + 1000);
    expect(isSent(list, contact(8))).toBe(true);
    expect(isSent(list, contact(8, { session: session("2026-12-05T08:00:00.000Z") }))).toBe(false); // moved to another date
    expect(isSent(list, contact(13))).toBe(false);
    // a day later it no longer counts
    expect(sentChangeRequests(T0 + SENT_TTL_MS).map((e) => e.id)).toEqual([8]);
    expect(sentChangeRequests(T0 + 1000 + SENT_TTL_MS)).toEqual([]);
    // what is not entries is ignored
    store.set(SENT_KEY, JSON.stringify([{ id: 8, startsAt: FUTURE, at: T0 }, 3, { id: "x", startsAt: FUTURE, at: T0 }, { id: 4, at: T0 }]));
    expect(sentChangeRequests(T0).map((e) => e.id)).toEqual([8]);
    store.set(SENT_KEY, "{not json");
    expect(sentChangeRequests(T0)).toEqual([]);
    rememberChangeRequest(contact(8), T0);
    forgetChangeRequests();
    expect(store.has(SENT_KEY)).toBe(false);
  });

  test("pruning drops entries about another date, a registration that is gone, or older than a day", () => {
    const store = fakeStorage();
    store.set(SENT_KEY, JSON.stringify([8, 9, 10].map((id) => ({ id, startsAt: FUTURE, at: id === 10 ? T0 - SENT_TTL_MS : T0 }))));
    pruneChangeRequests([contact(8), contact(9, { session: session("2026-12-05T08:00:00.000Z") })], T0);
    expect(JSON.parse(store.get(SENT_KEY)!)).toEqual([{ id: 8, startsAt: FUTURE, at: T0 }]);
  });

  test("blocked storage keeps nothing and throws nothing", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(sentChangeRequests()).toEqual([]);
    expect(() => rememberChangeRequest(contact(1))).not.toThrow();
    expect(() => pruneChangeRequests([])).not.toThrow();
    expect(() => forgetChangeRequests()).not.toThrow();
  });
});
