import { vi } from "vitest";

/** In-memory KV fake ({get, put}) that remembers the TTL of each put. */
export function fakeKv(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const ttl = new Map<string, number | undefined>();
  return {
    store,
    ttl,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
      store.set(key, value);
      ttl.set(key, opts?.expirationTtl);
    },
  };
}

export type FetchCall = { url: string; method: string; headers: Headers; body: unknown };

/**
 * Replaces globalThis.fetch: `respond(url)` gives each response (default 200 {}), every call is recorded with its
 * JSON body. Call `restore()` afterwards (or use vi.unstubAllGlobals()).
 */
export function stubFetch(respond: (url: string, init: RequestInit | undefined) => Response | Promise<Response> = () => Response.json({})) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = init?.body;
    let body: unknown = raw;
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    calls.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body });
    return respond(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn, restore: () => vi.unstubAllGlobals() };
}
