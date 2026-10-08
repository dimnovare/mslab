import { describe, expect, test } from "vitest";
import { isWelcomeCode, normalizeWelcomeCode, WELCOME_CODE_MAX, WELCOME_FRAGMENT, welcomeCodeOf, welcomeFragment } from "@/domain/welcome-code";

describe("the welcome code (Seaded 'Tervituskood', phase 2c)", () => {
  test("as typed → as stored: trimmed, in capitals", () => {
    expect(normalizeWelcomeCode("  tere-10 ")).toBe("TERE-10");
  });

  test("A–Z, 0–9 and '-', at most 30; empty is no code (allowed)", () => {
    expect(WELCOME_CODE_MAX).toBe(30);
    for (const ok of ["", "TERE10", "MS-LAB-2026", "A".repeat(30)]) expect(isWelcomeCode(ok), ok).toBe(true);
    for (const bad of ["TERE 10", "tere10", "ÕUN", "A".repeat(31), "X_1", "<b>"]) expect(isWelcomeCode(bad), bad).toBe(false);
  });

  test("the stored setting → its code, or '' (none, or a stored value of another shape)", () => {
    expect(welcomeCodeOf({ discountLabel: "10%", welcomeCode: "TERE10" })).toBe("TERE10");
    expect(welcomeCodeOf({ discountLabel: "10%" })).toBe("");
    expect(welcomeCodeOf({ welcomeCode: "tere 10" })).toBe("");
    expect(welcomeCodeOf(null)).toBe("");
    expect(welcomeCodeOf("TERE10")).toBe("");
  });

  test("the confirmed page's fragment: kood=<CODE>, read back only in that shape", () => {
    expect(welcomeFragment("TERE10")).toBe("kood=TERE10");
    expect(WELCOME_FRAGMENT.exec("kood=TERE-10")?.[1]).toBe("TERE-10");
    expect(WELCOME_FRAGMENT.exec("kood=<script>")).toBeNull();
    expect(WELCOME_FRAGMENT.exec("kood=")).toBeNull();
  });
});
