import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { unsubscribePage } from "@/server/unsubscribe-page";

// The page behind the unsubscribe link of the welcome mail (GET /api/newsletter/loobu?t=…): standalone HTML built by the route handler,
// with one form and one button, in the site's colours. Nothing in it deletes anything; the button POSTs.

const TOKEN = "tok-en_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8").toLowerCase();

describe("unsubscribePage", () => {
  test("Estonian: the name, the heading, the lead and one form that POSTs the token with one button", () => {
    const html = unsubscribePage("et", TOKEN);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="et">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toMatch(/<p class="brand">MS LAB<\/p>/);
    expect(html).toMatch(/<h1>Uudiskirjast loobumine<\/h1>/);
    expect(html).toMatch(/<p>Vajuta nuppu, et MS LABi uudiskirjast loobuda\.<\/p>/);
    expect(html.match(/<form /g)).toHaveLength(1);
    expect(html).toContain('<form method="post" action="/api/newsletter/loobu">');
    expect(html).toContain(`<input type="hidden" name="t" value="${TOKEN}">`);
    expect(html.match(/<button /g)).toHaveLength(1);
    expect(html).toMatch(/<button type="submit">Loobu uudiskirjast<\/button>/);
    expect(html).toContain("<title>Uudiskirjast loobumine");
  });

  test("Russian", () => {
    const html = unsubscribePage("ru", TOKEN);
    expect(html).toContain('<html lang="ru">');
    expect(html).toMatch(/<h1>Отказ от рассылки<\/h1>/);
    expect(html).toMatch(/<p>Нажмите кнопку, чтобы отписаться от рассылки MS LAB\.<\/p>/);
    expect(html).toMatch(/<button type="submit">Отписаться от рассылки<\/button>/);
  });

  test("without a usable token: no form and no button, the heading and the lead line only", () => {
    const html = unsubscribePage("et", null);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('name="t"');
    expect(html).toContain("<h1>Uudiskirjast loobumine</h1>");
    expect(html).toContain("Vajuta nuppu, et MS LABi uudiskirjast loobuda.");
  });

  test("the token is escaped into the attribute: nothing it holds can end the attribute or open a tag", () => {
    const html = unsubscribePage("et", `a"><script>alert(1)</script>&'`);
    expect(html).not.toContain("<script");
    expect(html).toContain('value="a&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;"');
  });

  test("no script and no external resource: inline CSS only, system or the site's font names", () => {
    const html = unsubscribePage("et", TOKEN);
    expect(html).not.toMatch(/<script|<link|<img|<iframe|@import|url\(/i);
    expect(html).not.toMatch(/(src|href)=/i);
    expect(html).toContain("<style>");
  });

  test("the colours are the site's tokens (tokens.css), and nothing else", () => {
    const css = /<style>([\s\S]*?)<\/style>/.exec(unsubscribePage("et", TOKEN))![1];
    const used = new Set((css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((c) => c.toLowerCase()));
    expect(used.size).toBeGreaterThanOrEqual(4); // ink, paper, canvas, line
    for (const colour of used) expect(tokens, colour).toContain(colour);
    expect(css).not.toMatch(/\b(rgba?|hsla?)\(/i);
  });

  test("mobile first and a 44 px target: the button is at least 44 px tall, the page has no fixed width, and it respects the user's motion setting by not animating", () => {
    const css = /<style>([\s\S]*?)<\/style>/.exec(unsubscribePage("et", TOKEN))![1];
    const button = /button\{[^}]*min-height:(\d+)px/.exec(css);
    expect(Number(button?.[1])).toBeGreaterThanOrEqual(44);
    expect(css).not.toMatch(/(?<![-\w])width:\s*\d{3,}px/); // a max-width is fine, a fixed width is not
    expect(css).not.toMatch(/animation|transition/);
  });
});
