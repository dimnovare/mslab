import { isLocalHost } from "./site";

// The access key of the review comment list (GET /api/feedback, PATCH /api/feedback/:id, page /guide/tagasiside/):
// the ADMIN_KEY secret (server/env.ts), sent by the list page in the `x-key` header.

/**
 * The key `next dev` accepts when no ADMIN_KEY is configured, so the e2e tests (and a local look at /guide/tagasiside/)
 * work without a secret. Only a development build on this machine uses it: the routes pass `dev` as
 * NODE_ENV === "development", which is inlined at build time (a production build has `dev: false` compiled in, so this
 * key is never accepted there), and the request must also be addressed to localhost.
 */
export const DEV_REVIEW_KEY = "local-review-key";

/** The key requests are checked against; "" = nothing is accepted. */
export function reviewKey(adminKey: string | undefined, local: { dev: boolean; host: string | null }): string {
  if (adminKey) return adminKey;
  return local.dev && isLocalHost(local.host) ? DEV_REVIEW_KEY : "";
}

const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

/**
 * Does `given` equal `expected`? Both are hashed first and the digests compared without an early exit, so the time taken
 * does not depend on how much of the key (or its length) a guess got right. An empty `expected` never matches.
 */
export async function keyMatches(given: string | null | undefined, expected: string): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = await Promise.all([digest(given ?? ""), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
