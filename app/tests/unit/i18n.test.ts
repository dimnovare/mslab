import { describe, expect, test } from "vitest";
import { pick, pickList } from "@/i18n/field";
import { href, publicPath, switchLocaleHref } from "@/i18n/href";
import { fill } from "@/i18n/format";
import { LOCALES, getDict } from "@/i18n/locales";
import { et } from "@/i18n/dict/et";
import { ru } from "@/i18n/dict/ru";
import { adminEt } from "@/i18n/dict/admin";

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, p + k + ".") : [p + k]));
const leaves = (o: object, p = ""): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? leaves(v, p + k + ".") : [[p + k, String(v)] as [string, string]]));

describe("i18n", () => {
  test("pick falls back to et", () => {
    expect(pick({ et: "Tere", ru: "Привет" }, "ru")).toBe("Привет");
    expect(pick({ et: "Tere" }, "ru")).toBe("Tere");
    expect(pick({ et: "Tere", ru: "  " }, "ru")).toBe("Tere");
    expect(pick(null, "et")).toBe("");
  });
  test("pickList", () => expect(pickList([{ et: "a", ru: "б" }, { et: "c" }], "ru")).toEqual(["б", "c"]));
  test("href", () => {
    expect(href("et", "/koolitused")).toBe("/koolitused");
    expect(href("ru", "/koolitused")).toBe("/ru/koolitused");
    expect(href("ru", "/")).toBe("/ru");
  });
  test("switchLocaleHref", () => {
    expect(switchLocaleHref("/ru/praktika", "et")).toBe("/praktika");
    expect(switchLocaleHref("/praktika", "ru")).toBe("/ru/praktika");
    expect(switchLocaleHref("/", "ru")).toBe("/ru");
  });
  test("publicPath drops the internal /et prefix only", () => {
    expect(publicPath("/et")).toBe("/");
    expect(publicPath("/et/konto")).toBe("/konto");
    expect(publicPath("/konto")).toBe("/konto");
    expect(publicPath("/etude")).toBe("/etude");
    expect(publicPath("/ru/konto")).toBe("/ru/konto");
    expect(publicPath("/")).toBe("/");
  });
  test("ru dictionary has every et key", () => {
    expect(keys(ru).sort()).toEqual(keys(et).sort());
  });
  test("getDict returns the dictionary of the locale", () => {
    expect(LOCALES).toEqual(["et", "ru"]);
    expect(getDict("et")).toBe(et);
    expect(getDict("ru")).toBe(ru);
  });
});

describe("dictionary content", () => {
  test("no empty strings", () => {
    for (const [name, dict] of [["et", et], ["ru", ru]] as const)
      for (const [k, v] of leaves(dict)) expect(v.trim(), `${name}.${k}`).not.toBe("");
  });
  test("ru uses the same {placeholders} as et", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    const ruLeaves = new Map(leaves(ru));
    for (const [k, v] of leaves(et)) expect(vars(ruLeaves.get(k)!), k).toEqual(vars(v));
  });
  test("ru is actually translated (Cyrillic) wherever et has five or more words", () => {
    const ruLeaves = new Map(leaves(ru));
    for (const [k, v] of leaves(et)) if (v.split(/\s+/).length > 4) expect(ruLeaves.get(k)!, k).toMatch(/[А-Яа-яЁё]/);
  });
  test("no AI tool names in client-facing strings", () => {
    for (const [k, v] of [...leaves(et), ...leaves(ru)]) expect(v, k).not.toMatch(/claude|anthropic|gpt|openai|lovable|chatgpt/i);
  });
});

describe("fill", () => {
  test("replaces known placeholders and leaves unknown ones", () => {
    expect(fill("© {year} MS LAB", { year: 2026 })).toBe("© 2026 MS LAB");
    expect(fill("{a}-{b}", { a: "x" })).toBe("x-{b}");
    expect(fill("no placeholders", {})).toBe("no placeholders");
  });
});

describe("admin dictionary (Estonian only)", () => {
  test("no empty strings, no AI tool names, and the placeholders the code fills are there", () => {
    for (const [k, v] of leaves(adminEt)) {
      expect(v.trim(), k).not.toBe("");
      expect(v, k).not.toMatch(/claude|anthropic|gpt|openai|lovable|chatgpt/i);
    }
    expect(adminEt.mail.text).toContain("{link}");
    expect(adminEt.panel.hello).toBe("Tere, {name}.");
  });
  test("the login e-mail and the neutral answer say what the brief says", () => {
    expect(adminEt.mail.subject).toBe("MS LAB — sisselogimislink");
    expect(adminEt.login.sent).toBe("Kui see aadress on lubatud, saatsime sisselogimislingi.");
    expect(adminEt.login.submit).toBe("Saada sisselogimislink");
  });
});
