// Fixed-window counter in KV: `limit` accepted submissions per key, the window restarting with each accepted one.
// KV is eventually consistent, so a burst from several edge locations can pass a little more than `limit`; that is
// fine for spam control of contact forms (storage stays the source of truth).

/** The part of a KV namespace (text values) the forms use; the Worker's KVNamespace binding satisfies it. */
export type TextKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

/** Submissions a visitor may make per form within RATE_WINDOW_SEC. */
export const RATE_LIMIT = 5;
export const RATE_WINDOW_SEC = 10 * 60;

/** true = allowed (and counted), false = over the limit. */
export async function rateLimit(kv: TextKv, key: string, limit: number, windowSec: number): Promise<boolean> {
  const n = Number((await kv.get(key)) ?? "0");
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: windowSec });
  return true;
}

/** KV key of one visitor and form: `rl:<form>:<ip>`. */
export const rateKey = (form: string, ip: string) => `rl:${form}:${ip}`;

/**
 * The visitor's address. On Cloudflare `cf-connecting-ip` is always set by the edge (clients cannot forge it);
 * `x-forwarded-for` (first hop) is only the fallback for `next dev`, and "local" when neither is there.
 */
export function clientIp(headers: Pick<Headers, "get">): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  const ip = cf || headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip ? ip.slice(0, 64) : "local"; // an IPv6 address has at most 45 characters; KV keys stay short
}
