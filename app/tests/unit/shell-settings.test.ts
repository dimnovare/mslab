import { describe, expect, test } from "vitest";
import { shellSettings } from "@/components/site/settings";

describe("shellSettings", () => {
  test("reads contact, newsletter discount and trainer name from the settings rows", () => {
    const s = shellSettings({
      contact: { email: " info@mslab.ee ", phone: "+372 5555 5555", address: "Pärnu", instagram: "", facebook: "" },
      newsletter: { discountLabel: "15%" },
      trainer: { name: "Maria Sosnina", stats: [] },
    });
    expect(s).toEqual({
      newsletter: { discountLabel: "15%" },
      contact: { email: "info@mslab.ee", phone: "+372 5555 5555", instagram: "", facebook: "" },
      trainerName: "Maria Sosnina",
    });
  });

  test("falls back to safe defaults when rows are missing or malformed", () => {
    for (const input of [{}, { contact: "x", newsletter: [], trainer: null }, { newsletter: { discountLabel: "  " } }]) {
      const s = shellSettings(input as Record<string, unknown>);
      expect(s.newsletter.discountLabel).toBe("10%");
      expect(s.contact).toEqual({ email: "", phone: "", instagram: "", facebook: "" });
      expect(s.trainerName).toBe("");
    }
  });
});
