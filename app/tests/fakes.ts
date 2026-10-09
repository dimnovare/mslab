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
    async delete(key: string): Promise<void> {
      store.delete(key);
      ttl.delete(key);
    },
    // The atomic counters of server/kv.ts PgKv (reserve / release), mirrored for a store that never expires an entry: nothing awaits
    // between the read and the write here, so they are atomic as the SQL statements are.
    async reserve(key: string, limit: number, windowSec: number): Promise<boolean> {
      const n = Number(store.get(key) ?? "0");
      if (n >= limit) return false;
      store.set(key, String(n + 1));
      ttl.set(key, windowSec);
      return true;
    },
    async release(key: string): Promise<void> {
      const n = Number(store.get(key) ?? "0");
      if (n > 0) store.set(key, String(n - 1)); // the window (ttl) stays
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

/** One object of fakeMediaStore. */
export type FakeMedia = { bytes: Uint8Array; contentType: string | null; disposition: string | null };

/**
 * An in-memory FileStore (server/media.ts) that remembers what was put (with its content type and Content-Disposition), which
 * keys were asked for and which were deleted. `initial` objects (bytes as a number list) are there from the start.
 */
export function fakeMediaStore(initial: Record<string, { bytes: number[]; contentType?: string }> = {}) {
  const objects = new Map<string, FakeMedia>(Object.entries(initial).map(([key, o]) => [key, { bytes: new Uint8Array(o.bytes), contentType: o.contentType ?? null, disposition: null }]));
  const requested: string[] = [];
  const deleted: string[] = [];
  return {
    objects,
    requested,
    deleted,
    async put(key: string, bytes: ArrayBuffer, contentType: string, disposition?: string): Promise<void> {
      objects.set(key, { bytes: new Uint8Array(bytes.slice(0)), contentType, disposition: disposition ?? null });
    },
    async delete(key: string): Promise<void> {
      deleted.push(key);
      objects.delete(key);
    },
    async get(key: string) {
      requested.push(key);
      const o = objects.get(key);
      return o ? { body: new Blob([o.bytes as BlobPart]).stream(), contentType: o.contentType, etag: '"e1"' } : null;
    },
  };
}
