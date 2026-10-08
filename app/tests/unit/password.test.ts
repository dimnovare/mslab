import { timingSafeEqual } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { passwordProblem, PASSWORD_MAX, PASSWORD_MIN } from "@/domain/password";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/password";

// A spy on node:crypto's timingSafeEqual that keeps the real one working: the comparison test below sees what is compared.
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return { ...real, timingSafeEqual: vi.fn(real.timingSafeEqual) };
});

// Phase 2c (spec 7): the optional password's hash (scrypt from node:crypto, N = 2^15, r = 8, p = 1, a 64-byte key, a 16-byte salt,
// `scrypt$15$8$1$<salt>$<key>` in base64url, compared in constant time) and its rules. The vector was computed with node:crypto's
// scrypt on these parameters (salt: 16 bytes of 7).

const VECTOR = "scrypt$15$8$1$BwcHBwcHBwcHBwcHBwcHBw$WqToJfstDtwnx_bEboLb0UvQAXO8St074XEbwjfx9mMSlSgfh3TJg5T36zMiIDJkJ_pGuHU4eVNSdMfifOREXg";
const SHAPE = /^scrypt\$15\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/;

describe("password hashes (scrypt)", () => {
  test("the stored form: a known vector, and a new random salt each time (both verify)", async () => {
    expect(await hashPassword("tere-tulemast-2026", Buffer.alloc(16, 7))).toBe(VECTOR);
    const a = await hashPassword("tere-tulemast-2026");
    const b = await hashPassword("tere-tulemast-2026");
    expect(a).toMatch(SHAPE);
    expect(a).not.toBe(b);
    expect([await verifyPassword("tere-tulemast-2026", a), await verifyPassword("tere-tulemast-2026", b)]).toEqual([true, true]);
  });

  test("the right password verifies; a wrong one, another case, an extra space or nothing does not", async () => {
    expect(await verifyPassword("tere-tulemast-2026", VECTOR)).toBe(true);
    for (const wrong of ["tere-tulemast-2025", "Tere-tulemast-2026", "tere-tulemast-2026 ", ""]) expect(await verifyPassword(wrong, VECTOR), wrong).toBe(false);
  });

  test("the derived key is compared with timingSafeEqual (two 64-byte buffers), for a wrong password as for the right one; a malformed value compares nothing", async () => {
    const compared = vi.mocked(timingSafeEqual);
    compared.mockClear();
    expect(await verifyPassword("tere-tulemast-2026", VECTOR)).toBe(true);
    expect(await verifyPassword("tere-tulemast-2025", VECTOR)).toBe(false);
    expect(compared.mock.results.map((r) => r.value)).toEqual([true, false]);
    expect(compared.mock.calls.map(([derived, expected]) => [derived.byteLength, expected.byteLength])).toEqual([[64, 64], [64, 64]]);
    compared.mockClear();
    expect(await verifyPassword("tere-tulemast-2026", "plain")).toBe(false);
    expect(compared).not.toHaveBeenCalled();
  });

  test("a malformed or foreign stored value is false, never an error and never more work than ours", async () => {
    const foreign = ["", "plain", VECTOR.replace("$15$", "$16$"), VECTOR.replace("$8$1$", "$1$1$"), VECTOR.slice(0, -2), `bcrypt${VECTOR.slice(6)}`, VECTOR.replace("BwcHBwcHBwcHBwcHBwcHBw", "Bw")];
    for (const stored of foreign) expect(await verifyPassword("tere-tulemast-2026", stored), stored).toBe(false);
  });

  test("a password typed with combining marks is the same password as the composed one (NFC)", async () => {
    // written with escapes, so that no editor or tool can normalise the two spellings into one (the test could not fail then)
    const stored = await hashPassword("M\u00f5\u00f5dulint-123"); // õ as one code point
    expect(await verifyPassword("Mo\u0303o\u0303dulint-123", stored)).toBe(true); // o and the combining tilde, twice
  });

  test("a salt of another length is refused: verifyPassword would never accept the hash", async () => {
    for (const length of [0, 8, 15, 17, 32]) await expect(hashPassword("tere-tulemast-2026", Buffer.alloc(length, 7)), String(length)).rejects.toThrow();
  });

  test("the dummy hash has today's shape and matches no likely password", async () => {
    expect(DUMMY_HASH).toMatch(SHAPE);
    for (const guess of ["", "password", "tere-tulemast-2026", "0123456789"]) expect(await verifyPassword(guess, DUMMY_HASH), guess).toBe(false);
  });
});

describe("the password rules (Minu andmed and the server)", () => {
  test("10 … 200 characters, counted as people count them; not the account's e-mail address", () => {
    expect([PASSWORD_MIN, PASSWORD_MAX]).toEqual([10, 200]);
    expect(passwordProblem("123456789", "kati@example.test")).toBe("short");
    expect(passwordProblem("1234567890", "kati@example.test")).toBeNull();
    expect(passwordProblem("õ".repeat(10), "kati@example.test")).toBeNull();
    expect(passwordProblem("😀".repeat(9), "kati@example.test")).toBe("short"); // 9 characters, 18 UTF-16 units
    expect(passwordProblem("x".repeat(200), "kati@example.test")).toBeNull();
    expect(passwordProblem("x".repeat(201), "kati@example.test")).toBe("long");
    expect(passwordProblem(" KATI@example.test ", "kati@example.test")).toBe("email");
  });

  test("the length is counted after NFC, as the hash is made: an o and a combining tilde is one character", () => {
    // escapes, as in the NFC test above: 2 code points typed, 1 character after NFC
    const tilde = "o\u0303";
    expect(passwordProblem(tilde.repeat(5), "kati@example.test")).toBe("short"); // 10 code points, 5 characters
    expect(passwordProblem(tilde.repeat(10), "kati@example.test")).toBeNull();
    expect(passwordProblem(tilde.repeat(150), "kati@example.test")).toBeNull(); // 300 code points, 150 characters
    expect(passwordProblem(tilde.repeat(201), "kati@example.test")).toBe("long");
  });
});
