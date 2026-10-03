// Random tokens and their SHA-256 hashes (Web Crypto, so the same code runs on the server, in `next dev` and in tests).
// Newsletter confirmation tokens and the admin login links / session ids are all 32 random bytes in base64url; the
// admin tables store only the hash, so a copy of the database cannot be used to log in.

/** 32 random bytes, base64url (43 characters). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Lowercase hex SHA-256 of a string. */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The shape newToken() produces (a little slack for length); anything else cannot be a token and skips the database. */
export const isTokenShape = (value: string | null | undefined): value is string => !!value && /^[A-Za-z0-9_-]{20,100}$/.test(value);
