// The admins' pass through the coming-soon gate (lib/site-gate.ts, hotfix 08.10): the cookie `mslab_preview`, set next to the
// admin session at sign-in (api/auth/verify) and by "Vaata kodulehte" (api/admin/preview), cleared at logout. The middleware
// checks it on every request, so it is signed rather than looked up: `<exp>.<sig>`, exp in unix seconds and sig the base64url
// HMAC-SHA256 of "preview:<exp>" under the setting PREVIEW_SECRET. Web Crypto only: the same code runs in the middleware, the
// route handlers and the tests. It shows the site, nothing more: every admin page and API still asks for the session.
// Changing PREVIEW_SECRET ends every pass at once.

export const PREVIEW_COOKIE = "mslab_preview";

/** The admin session's lifetime (server/auth.ts SESSION_TTL_MS), in seconds: the cookie's Max-Age and the signed expiry. */
export const PREVIEW_TTL_S = 30 * 24 * 60 * 60;

/** Attributes of the cookie (Max-Age is added when it is set; 0 clears it). Not readable by scripts; sent on top-level visits from other sites (Lax). */
export const previewCookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;

/** The shortest PREVIEW_SECRET used: a shorter one (a placeholder, a typo) could be guessed, and counts as not set. */
export const PREVIEW_SECRET_MIN = 32;

/** The key PREVIEW_SECRET gives (trimmed), or undefined when it is unset, blank or shorter than PREVIEW_SECRET_MIN: then nothing is signed or valid. */
export function previewKey(secret: string | undefined): string | undefined {
  const key = secret?.trim();
  return key && key.length >= PREVIEW_SECRET_MIN ? key : undefined;
}

/** Unix seconds as signed: digits, no sign, no leading zero, at most 12 (the message is the text as it is in the cookie). */
const EXP = /^[1-9][0-9]{0,11}$/;
/** 32 bytes in base64url without padding. */
const SIG = /^[A-Za-z0-9_-]{43}$/;

const encoder = new TextEncoder();

function hmacKey(secret: string, use: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [use]);
}

const message = (exp: string) => encoder.encode(`preview:${exp}`);

const toBase64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** The bytes of a value SIG has already accepted. */
function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=");
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** A new cookie value, valid for PREVIEW_TTL_S from `now` (ms). Throws on a secret previewKey refuses: nothing is signed with a weak key. */
export async function signPreview(secret: string, now: number = Date.now()): Promise<string> {
  const key = previewKey(secret);
  if (!key) throw new Error(`PREVIEW_SECRET is not set or shorter than ${PREVIEW_SECRET_MIN} characters`);
  const exp = String(Math.floor(now / 1000) + PREVIEW_TTL_S);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(key, "sign"), message(exp)));
  return `${exp}.${toBase64url(sig)}`;
}

/**
 * Is `value` a pass signed with `secret` that has not expired at `now` (ms)? No usable secret (unset, blank or too short,
 * previewKey): nothing is. The signature is compared by Web Crypto's verify (constant time); a value of the wrong shape is
 * refused before any crypto.
 */
export async function verifyPreview(value: string | undefined, secret: string | undefined, now: number = Date.now()): Promise<boolean> {
  const key = previewKey(secret);
  if (!key || !value) return false;
  const dot = value.indexOf(".");
  if (dot < 0) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!EXP.test(exp) || !SIG.test(sig)) return false;
  if (Number(exp) * 1000 <= now) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(key, "verify"), fromBase64url(sig), message(exp));
  } catch {
    return false;
  }
}
