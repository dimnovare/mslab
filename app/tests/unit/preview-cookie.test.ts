import { describe, expect, test } from "vitest";
import { PREVIEW_COOKIE, PREVIEW_SECRET_MIN, PREVIEW_TTL_S, previewKey, signPreview, verifyPreview } from "@/lib/preview-cookie";

// The admins' pass through the coming-soon gate (lib/site-gate.ts): `<exp>.<sig>`, exp in unix seconds, sig the base64url
// HMAC-SHA256 of "preview:<exp>" under PREVIEW_SECRET. Checked in the middleware with Web Crypto, without the database.

const SECRET = "preview-secret-for-tests-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const DAY = 86_400_000;

/** The HMAC of `message` under `secret`, base64url, made here independently of the module. */
async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("the preview cookie", () => {
  test("its name and lifetime: mslab_preview, the admin session's 30 days", () => {
    expect(PREVIEW_COOKIE).toBe("mslab_preview");
    expect(PREVIEW_TTL_S).toBe(30 * 24 * 60 * 60);
  });

  test("signPreview: <exp>.<sig>, exp 30 days ahead in unix seconds, sig = base64url HMAC-SHA256(secret, 'preview:<exp>')", async () => {
    const value = await signPreview(SECRET, NOW);
    const [exp, sig] = value.split(".");
    expect(value).toMatch(/^[0-9]+\.[A-Za-z0-9_-]{43}$/);
    expect(Number(exp)).toBe(NOW / 1000 + PREVIEW_TTL_S);
    expect(sig).toBe(await hmac(SECRET, `preview:${exp}`));
  });

  test("signPreview refuses an empty secret (nothing is ever signed with a blank key)", async () => {
    await expect(signPreview("", NOW)).rejects.toThrow(/PREVIEW_SECRET/);
    await expect(signPreview("   ", NOW)).rejects.toThrow(/PREVIEW_SECRET/);
  });

  test("a secret shorter than 32 characters counts as unset: previewKey, signPreview and verifyPreview all refuse it", async () => {
    expect(PREVIEW_SECRET_MIN).toBe(32);
    const short = "s".repeat(31);
    const just = "s".repeat(32);
    for (const secret of [undefined, "", "   ", "1", short, ` ${short} `, `${short}
`]) expect(previewKey(secret), JSON.stringify(secret)).toBeUndefined();
    expect(previewKey(just)).toBe(just);
    expect(previewKey(` ${just}
`)).toBe(just); // read trimmed, as every setting
    await expect(signPreview(short, NOW)).rejects.toThrow(/PREVIEW_SECRET/);
    await expect(signPreview("1", NOW)).rejects.toThrow(/PREVIEW_SECRET/);
    // a value signed with the short key by someone else is no pass under it either
    const exp = String(NOW / 1000 + 3600);
    for (const secret of [short, "1"]) expect(await verifyPreview(`${exp}.${await hmac(secret, `preview:${exp}`)}`, secret, NOW), secret).toBe(false);
    // 32 characters are enough
    expect(await verifyPreview(await signPreview(just, NOW), just, NOW)).toBe(true);
  });

  test("a value it signed is valid until it expires, and not a second later", async () => {
    const value = await signPreview(SECRET, NOW);
    expect(await verifyPreview(value, SECRET, NOW)).toBe(true);
    expect(await verifyPreview(value, SECRET, NOW + 29 * DAY)).toBe(true);
    expect(await verifyPreview(value, SECRET, NOW + 30 * DAY - 1000)).toBe(true);
    expect(await verifyPreview(value, SECRET, NOW + 30 * DAY)).toBe(false);
    expect(await verifyPreview(value, SECRET, NOW + 31 * DAY)).toBe(false);
  });

  test("an expired value is refused even with a correct signature", async () => {
    const exp = String(NOW / 1000 - 1);
    expect(await verifyPreview(`${exp}.${await hmac(SECRET, `preview:${exp}`)}`, SECRET, NOW)).toBe(false);
  });

  test("a tampered signature or a moved expiry is refused", async () => {
    const value = await signPreview(SECRET, NOW);
    const [exp, sig] = value.split(".");
    const flipped = sig.slice(0, 10) + (sig[10] === "A" ? "B" : "A") + sig.slice(11);
    expect(await verifyPreview(`${exp}.${flipped}`, SECRET, NOW)).toBe(false);
    // a later expiry with the old signature
    expect(await verifyPreview(`${Number(exp) + 86_400}.${sig}`, SECRET, NOW)).toBe(false);
    // a signature of another message under the right key
    expect(await verifyPreview(`${exp}.${await hmac(SECRET, exp)}`, SECRET, NOW)).toBe(false);
    expect(await verifyPreview(`${exp}.${await hmac(SECRET, `session:${exp}`)}`, SECRET, NOW)).toBe(false);
  });

  test("a value signed with another secret is refused", async () => {
    const value = await signPreview("another-secret-0123456789abcdef-x", NOW);
    expect(await verifyPreview(value, SECRET, NOW)).toBe(false);
  });

  test("no secret (unset, empty, blank) refuses everything, whatever was signed", async () => {
    const value = await signPreview(SECRET, NOW);
    for (const secret of [undefined, "", "   "]) expect(await verifyPreview(value, secret, NOW), String(secret)).toBe(false);
    // a value signed with an empty key is no way in either
    const exp = String(NOW / 1000 + 3600);
    const blankKey = await crypto.subtle.importKey("raw", new Uint8Array(0), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).catch(() => null);
    if (blankKey) {
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", blankKey, new TextEncoder().encode(`preview:${exp}`)));
      const b64 = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      expect(await verifyPreview(`${exp}.${b64}`, "", NOW)).toBe(false);
    }
  });

  test("malformed values are refused without throwing", async () => {
    const value = await signPreview(SECRET, NOW);
    const [exp, sig] = value.split(".");
    for (const bad of [
      undefined,
      "",
      ".",
      exp,
      `${exp}.`,
      `.${sig}`,
      sig,
      `${exp}.${sig}.x`,
      `${exp}.${sig}=`, // padding is not base64url
      `${exp}.${sig.slice(0, 42)}`, // a byte short
      `${exp}.${sig}A`, // too long
      `${exp}.${sig.replace(/[A-Za-z]/, "+")}`, // base64, not base64url
      ` ${exp}.${sig}`,
      `${exp}.${sig} `,
      `+${exp}.${sig}`,
      `0${exp}.${sig}`, // a leading zero: another message than the one signed
      `${exp}.0.${sig}`,
      `1e12.${sig}`,
      `-1.${sig}`,
      `${exp}x.${sig}`,
      "9".repeat(400) + `.${sig}`,
      "a".repeat(5000),
      `${exp}.${"é".repeat(43)}`,
    ])
      expect(await verifyPreview(bad, SECRET, NOW), String(bad)).toBe(false);
  });
});
