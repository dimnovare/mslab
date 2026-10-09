import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// The optional client password's hash (phase 2c, spec 7): scrypt from node:crypto (no dependency) with N = 2^15, r = 8, p = 1, a
// 64-byte key and a 16-byte random salt, stored as `scrypt$15$8$1$<salt>$<key>` (base64url) and compared with timingSafeEqual. About
// 0.1 s (90 … 120 ms on a 12th-gen desktop i5, Node 22) and 32 MiB a hash. The password is NFC-normalised first: the same letters
// typed with combining marks are the same password.

const LOG_N = 15;
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
/** scrypt needs 128 · N · r bytes (32 MiB here); Node's default limit is exactly that, which OpenSSL refuses as too little. */
const MAX_MEM = 64 * 1024 * 1024;
const STORED = /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/;

/**
 * A hash nobody's password matches (made from a random password that was thrown away): checked when an address has no password, or
 * no account, so that a login takes as long whether or not the address exists or has one.
 */
export const DUMMY_HASH = "scrypt$15$8$1$lCc8-6rYvD2U2LCtaJP3HA$n3Y4HKEJRU7WwatuhJ3L-cWLcTQ5y39QRQvnb5FbgL_DwAeh6p8b_GjzIeLYBloWmheoPJZ4cy4eaHr_tbiJYw";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, KEY_BYTES, { N: 2 ** LOG_N, r: R, p: P, maxmem: MAX_MEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** The stored form of `password`: a new random salt, unless one is given (the tests' known vector; it must be SALT_BYTES long). */
export async function hashPassword(password: string, salt: Buffer = randomBytes(SALT_BYTES)): Promise<string> {
  if (salt.length !== SALT_BYTES) throw new RangeError(`a salt is ${SALT_BYTES} bytes`); // verifyPassword would refuse the hash of any other
  const key = await derive(password, salt);
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Does `password` match `stored`? false for a value of another shape or other parameters: never an error, never more work than ours. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = STORED.exec(stored);
  if (!m || Number(m[1]) !== LOG_N || Number(m[2]) !== R || Number(m[3]) !== P) return false;
  const salt = Buffer.from(m[4], "base64url");
  const expected = Buffer.from(m[5], "base64url");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  return timingSafeEqual(await derive(password, salt), expected);
}
