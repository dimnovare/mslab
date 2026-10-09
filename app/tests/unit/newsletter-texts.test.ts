import { describe, expect, test } from "vitest";
import { et } from "@/i18n/dict/et";
import { ru } from "@/i18n/dict/ru";

// The visitor-facing texts of the newsletter in one step (owner decision 09.10), pinned as the brief gives them. The Russian ones are
// drafts for the native-speaker check (docs/launch-checklist.md §9); the typography rule is the account's: a no-break space after the
// one-letter words в, с, к, о, у.

describe("the answers after \"Liitu\"", () => {
  test("Estonian: the heading, the line and the popup's one sentence; the line under the button is as it was", () => {
    expect(et.newsletter.sentTitle).toBe("Aitäh, oled liitunud!");
    expect(et.newsletter.sentText).toBe("Saatsime sulle tervituskirja.");
    expect(et.newsletter.popupSent).toBe("Aitäh, oled liitunud! Saatsime sulle tervituskirja.");
    expect(et.newsletter.notice).toBe("Liitudes saad MS LABi uudiskirja. Saad igal ajal loobuda.");
  });

  test("Russian", () => {
    expect(ru.newsletter.sentTitle).toBe("Спасибо, вы подписались!");
    expect(ru.newsletter.sentText).toBe("Мы отправили вам приветственное письмо.");
    expect(ru.newsletter.popupSent).toBe("Спасибо, вы подписались! Мы отправили вам приветственное письмо.");
    expect(ru.newsletter.notice).toBe("Подписываясь, вы получаете рассылку MS LAB. Отписаться можно в любой момент.");
  });

  test("nothing of the confirmation step is left to be shown: no 'check your inbox', no confirmation link in the answers", () => {
    for (const dict of [et, ru]) {
      const keys = Object.keys(dict.newsletter);
      expect(keys).not.toContain("confirmTitle");
      expect(keys).not.toContain("confirmText");
      expect(Object.keys(dict.mail)).not.toContain("confirmSubject");
      expect(Object.keys(dict.mail)).not.toContain("confirmText");
    }
  });
});

describe("the unsubscribe line of the welcome mail", () => {
  test("Estonian and Russian, with the link where {link} stands", () => {
    expect(et.mail.welcome.unsubscribe).toBe("Kui sa ei liitunud ise või ei soovi enam MS LABi kirju, loobu siit: {link}");
    expect(ru.mail.welcome.unsubscribe).toBe("Если вы не подписывались сами или больше не хотите получать письма MS LAB, отпишитесь здесь: {link}");
  });
});

describe("the notice after the unsubscribe link (?uudiskiri=loobutud)", () => {
  test("Estonian and Russian", () => {
    expect(et.newsletter.unsubscribedTitle).toBe("Oled uudiskirjast loobunud.");
    expect(et.newsletter.unsubscribedText).toBe("Me ei saada sulle enam MS LABi uudiskirja.");
    expect(ru.newsletter.unsubscribedTitle).toBe("Вы отписались от рассылки.");
    expect(ru.newsletter.unsubscribedText).toBe("Мы больше не будем присылать вам рассылку MS LAB.");
  });
});

describe("Russian typography in the new strings", () => {
  const strings: [string, string][] = [
    ["newsletter.sentTitle", ru.newsletter.sentTitle],
    ["newsletter.sentText", ru.newsletter.sentText],
    ["newsletter.popupSent", ru.newsletter.popupSent],
    ["newsletter.unsubscribedTitle", ru.newsletter.unsubscribedTitle],
    ["newsletter.unsubscribedText", ru.newsletter.unsubscribedText],
    ["mail.welcome.unsubscribe", ru.mail.welcome.unsubscribe],
  ];

  test("no one-letter preposition (в, с, к, о, у) is followed by an ordinary space: it takes a no-break space", () => {
    for (const [key, text] of strings) expect(text, key).not.toMatch(/(^|[\s(«])[вскоуВСКОУ] /u);
  });
});
