import { describe, expect, test } from "vitest";
import { SECTIONS } from "@/components/admin/sections";
import { centsToInput, MAX_PAYMENT_CENTS, parseEuroCents } from "@/domain/money";
import { registrationPrice, registrationStatusAfterPayment } from "@/domain/registration";
import { adminEt } from "@/i18n/dict/admin";
import { formatLongDate, formatStamp, formatTime } from "@/i18n/format";
import { csvCell, toCsv } from "@/server/csv";

// Task 12: the pure parts of the admin inbox — the amount field, the price a payment is measured against, the CSV
// export (formula cells defused), the date formats and the menu.

describe("parseEuroCents (Laekunud summa)", () => {
  test("whole euros, comma or point decimals, spaces and the euro sign", () => {
    expect(parseEuroCents("175")).toBe(17500);
    expect(parseEuroCents("175,5")).toBe(17550);
    expect(parseEuroCents("175,50")).toBe(17550);
    expect(parseEuroCents("175.05")).toBe(17505);
    expect(parseEuroCents(" 1 175 € ")).toBe(117500);
    expect(parseEuroCents("1 175,00")).toBe(117500);
    expect(parseEuroCents("0")).toBe(0);
  });
  test("anything else is not an amount", () => {
    for (const bad of ["", " ", "abc", "-10", "10,505", "1.175,50", "1,2,3", "+5", "1e3", "12 €x", ",5"]) expect(parseEuroCents(bad), bad).toBeNull();
    expect(parseEuroCents(String(MAX_PAYMENT_CENTS / 100))).toBe(MAX_PAYMENT_CENTS);
    expect(parseEuroCents(String(MAX_PAYMENT_CENTS / 100 + 1))).toBeNull();
  });
  test("centsToInput writes what parseEuroCents reads", () => {
    expect(centsToInput(17500)).toBe("175");
    expect(centsToInput(17550)).toBe("175,50");
    expect(centsToInput(17505)).toBe("175,05");
    expect(centsToInput(0)).toBe("0");
    for (const c of [0, 1, 99, 100, 17499, 17550, 123456]) expect(parseEuroCents(centsToInput(c))).toBe(c);
  });
});

describe("registrationPrice + Maria's 50% rule", () => {
  const contact = { type: "contact" as const, price: null, priceGroup: 35000, priceIndividual: 45000 };
  test("group → group price, individual → individual price, e-learning → its price, missing → null", () => {
    expect(registrationPrice(contact, "group")).toBe(35000);
    expect(registrationPrice(contact, "individual")).toBe(45000);
    expect(registrationPrice({ type: "e_learning", price: 9500, priceGroup: null, priceIndividual: null }, "group")).toBe(9500);
    expect(registrationPrice({ ...contact, priceIndividual: null }, "individual")).toBeNull();
  });
  test("the amount from the form decides the status against that price", () => {
    const total = registrationPrice(contact, "group")!;
    expect(registrationStatusAfterPayment({ status: "awaiting_prepayment", paidCents: parseEuroCents("174,99")! }, total)).toBe("awaiting_prepayment");
    expect(registrationStatusAfterPayment({ status: "awaiting_prepayment", paidCents: parseEuroCents("175")! }, total)).toBe("confirmed");
    expect(registrationStatusAfterPayment({ status: "confirmed", paidCents: parseEuroCents("100")! }, total)).toBe("awaiting_prepayment");
    expect(registrationStatusAfterPayment({ status: "cancelled", paidCents: parseEuroCents("350")! }, total)).toBe("cancelled");
  });
});

describe("CSV", () => {
  test("cells that a spreadsheet would run as a formula get an apostrophe", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+372 5555")).toBe("'+372 5555");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=cmd")).toBe("'\t=cmd");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell("maria@example.com")).toBe("maria@example.com");
    expect(csvCell("a=b")).toBe("a=b");
  });
  test("quotes, commas, semicolons, line breaks and edge spaces are quoted; empty values are empty", () => {
    expect(csvCell('Tere "Maria"')).toBe('"Tere ""Maria"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("rida\nteine")).toBe('"rida\nteine"');
    expect(csvCell(" x")).toBe('" x"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(12)).toBe("12");
  });
  test("a file: BOM, header, CRLF lines", () => {
    expect(toCsv(["E-post", "Keel"], [["a@b.ee", "ET"], ["=x", "RU"]])).toBe("﻿E-post,Keel\r\na@b.ee,ET\r\n'=x,RU\r\n");
    expect(toCsv(["E-post"], [])).toBe("﻿E-post\r\n");
  });
});

describe("admin date formats (Estonian time)", () => {
  const d = new Date("2026-10-01T11:05:00Z"); // 14:05 in Tallinn (summer time)
  test("time, long date, CSV stamp", () => {
    expect(formatTime(d, "et")).toBe("14:05");
    expect(formatLongDate(d, "et")).toBe("Neljapäev, 1. oktoober");
    expect(formatStamp(d)).toBe("2026-10-01 14:05");
    expect(formatStamp(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01 00:30"); // winter time, next day
  });
});

describe("admin menu (prototype B sidebar, A1)", () => {
  test("the sections in Maria's order, each with its Estonian label and its own address", () => {
    expect(SECTIONS.map((s) => adminEt.nav[s.key])).toEqual([
      "Ülevaade",
      "Koolitused",
      "Kalender",
      "Registreerimised",
      "Päringud",
      "Praktika",
      "Avaleht",
      "Koolitaja",
      "Uudised",
      "Kampaania",
      "Uudiskiri",
      "Seaded",
    ]);
    expect(new Set(SECTIONS.map((s) => s.href)).size).toBe(SECTIONS.length);
    for (const s of SECTIONS) expect(s.href).toMatch(/^\/admin(\/[a-z]+)?$/);
    expect(adminEt.shell.viewSite).toBe("Vaata lehte");
    expect(adminEt.shell.logout).toBe("Logi välja");
  });
  test("the status labels and the e-learning note are Maria's words", () => {
    expect(adminEt.registrations.status).toEqual({ awaiting_prepayment: "Ootab ettemaksu", confirmed: "Kinnitatud", cancelled: "Tühistatud" });
    expect(adminEt.registrations.type).toEqual({ all: "Kõik", e: "E-õpe", k: "Kontaktõpe" });
    expect(adminEt.registrations.eNote).toBe("E-õppe ostud lisanduvad koos maksetega.");
    expect(adminEt.requests.tabs).toEqual({ kontakt: "Kontakt", individuaal: "Individuaal", praktika: "Praktika", ootenimekiri: "Ootenimekiri" });
  });
});
