import { expect, test } from "vitest";
import { fixDomain, isEmail, isSampleAddress, normalizeEmail, typoSuggestion } from "@/domain/email";

test("normalise", () => {
  expect(normalizeEmail("  Kati.Tamm@Example.TEST ")).toBe("kati.tamm@example.test");
});
test("shape", () => {
  expect(isEmail("kati@example.test")).toBe(true);
  for (const bad of ["", "kati", "kati@", "@example.test", "kati@example", "kati @example.test"]) expect(isEmail(bad)).toBe(false);
  expect(isEmail(`${"a".repeat(64)}@${"b".repeat(186)}.test`)).toBe(false); // 256 characters: over the SMTP limit
});
// Addresses are built, never written out: the repo's address guard (tests/unit/test-addresses.test.ts) rejects
// real-domain addresses in tracked files, and this repository is public.
const at = (local: string, domain: string) => `${local}@${domain}`;
test("domain fixes", () => {
  expect(fixDomain("gmial.com")).toBe("gmail.com");
  expect(fixDomain("gmail.ee")).toBe("gmail.com");
  expect(fixDomain("hotmial.com")).toBe("hotmail.com");
  expect(fixDomain("mail.ee")).toBeNull();
  expect(fixDomain("gmail.com")).toBeNull();
});
test("sample addresses are recognised", () => {
  expect(isSampleAddress("kati.naidis@example.test")).toBe(true);
  expect(isSampleAddress("Kati@Example.TEST")).toBe(true);
  expect(isSampleAddress(at("kati", "example.testing.ee"))).toBe(false);
});
test("typo suggestion keeps the local part", () => {
  expect(typoSuggestion(at("kati", "gmial.com"))).toBe(at("kati", "gmail.com"));
  expect(typoSuggestion(at("kati", "mail.ee"))).toBeNull();
  expect(typoSuggestion("kati")).toBeNull();
});
