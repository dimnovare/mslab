import { createHash, createHmac } from "node:crypto";
// first, as in Next.js's server: it puts AsyncLocalStorage on globalThis, which the work stores below need
import "next/dist/server/node-environment-baseline";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { createDedupeFetch } from "next/dist/server/lib/dedupe-fetch";
import { createPatchedFetcher } from "next/dist/server/lib/patch-fetch";
import { describe, expect, test, vi } from "vitest";
import { errorSummary } from "@/server/log";
import { R2Error, r2Store } from "@/server/r2";

// R2 through its S3 API (src/server/r2.ts): signed requests (AWS Signature V4, region "auto", service "s3") to
// https://<account>.r2.cloudflarestorage.com/<bucket>/<key>. Nothing here reaches the network: the store takes the
// fetch function as a parameter and these tests pass a fake that records the request. The credentials are made up.

const CONFIG = { accountId: "0123456789abcdef0123456789abcdef", accessKeyId: "AKIDFAKEFAKEFAKE", secretAccessKey: "fake-secret-access-key-for-tests", bucket: "mslab-media" };
const KEY = "img/0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f.jpg";
const URL_OF_KEY = `https://${CONFIG.accountId}.r2.cloudflarestorage.com/${CONFIG.bucket}/${KEY}`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

type Seen = { request: Request; body: Uint8Array<ArrayBuffer>; signal: AbortSignal | null | undefined };

/** A fetch that records what it was asked and answers with `respond`. */
function fakeFetch(respond: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 200 })) {
  const seen: Seen[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    seen.push({ request, body: new Uint8Array(await request.clone().arrayBuffer()), signal: init?.signal });
    return respond(request);
  });
  return { seen, fetch: fn as unknown as typeof fetch };
}

const sha256hex = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * Checks the Authorization header of a request with an independent implementation of AWS Signature V4 (not aws4fetch):
 * the canonical request, the string to sign and the signing key, written out from the AWS documentation. The payload
 * hash in the canonical request is the x-amz-content-sha256 header's, as S3 defines it.
 */
function signatureIsValid(request: Request, secret: string): boolean {
  const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/auto\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return false;
  const [, , day, signedHeaders, signature] = m;
  const url = new URL(request.url);
  const canonicalHeaders = signedHeaders
    .split(";")
    .map((name) => `${name}:${(name === "host" ? url.host : request.headers.get(name) ?? "").trim()}\n`)
    .join("");
  const canonicalRequest = [request.method, url.pathname, url.search.slice(1), canonicalHeaders, signedHeaders, request.headers.get("x-amz-content-sha256")].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", request.headers.get("x-amz-date"), `${day}/auto/s3/aws4_request`, sha256hex(canonicalRequest)].join("\n");
  const signingKey = ["auto", "s3", "aws4_request"].reduce((key, part) => hmac(key, part), hmac(`AWS4${secret}`, day));
  return hmac(signingKey, stringToSign).toString("hex") === signature;
}

describe("put", () => {
  test("a signed PUT of the bytes to <account>.r2.cloudflarestorage.com/<bucket>/<key>, with the content type", async () => {
    const { seen, fetch } = fakeFetch();
    await r2Store(CONFIG, fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg");
    expect(seen).toHaveLength(1);
    const { request, body } = seen[0];
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(URL_OF_KEY);
    expect(request.headers.get("content-type")).toBe("image/jpeg");
    expect([...body]).toEqual([...JPEG]);
    // the date, the payload hash and the credential scope: region auto, service s3
    expect(request.headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(request.headers.get("x-amz-content-sha256")).toBe(sha256hex(JPEG));
    const auth = request.headers.get("authorization")!;
    expect(auth).toMatch(new RegExp(`^AWS4-HMAC-SHA256 Credential=${CONFIG.accessKeyId}/\\d{8}/auto/s3/aws4_request, SignedHeaders=`));
    // what is signed: the host, the date and the payload hash (aws4fetch leaves content-type out; TLS protects it)
    expect(/SignedHeaders=([^,]+)/.exec(auth)![1].split(";")).toEqual(["host", "x-amz-content-sha256", "x-amz-date"]);
  });

  test("the signature is a valid AWS Signature V4 for that request and secret (and for no other secret)", async () => {
    const { seen, fetch } = fakeFetch();
    await r2Store(CONFIG, fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg");
    const { request, body } = seen[0];
    expect(signatureIsValid(request, CONFIG.secretAccessKey)).toBe(true);
    expect(signatureIsValid(request, "another-secret")).toBe(false);
    // the payload hash is signed (and is the hash of the bytes sent): another hash no longer fits the signature
    const headers = new Headers(request.headers);
    headers.set("x-amz-content-sha256", sha256hex(new Uint8Array([1])));
    expect(signatureIsValid(new Request(request.url, { method: "PUT", headers, body }), CONFIG.secretAccessKey)).toBe(false);
  });

  test("the secret never travels: not in the URL, not in any header", async () => {
    const { seen, fetch } = fakeFetch();
    await r2Store(CONFIG, fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg");
    const { request } = seen[0];
    expect(request.url).not.toContain(CONFIG.secretAccessKey);
    for (const [name, value] of request.headers) expect(`${name}: ${value}`, name).not.toContain(CONFIG.secretAccessKey);
  });

  test("the request has a time limit (an AbortSignal)", async () => {
    const { seen, fetch } = fakeFetch();
    await r2Store(CONFIG, fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg");
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
  });

  test("an answer that is not 2xx is an R2Error with the status, and no message that could hold a URL or a key", async () => {
    const { fetch } = fakeFetch(() => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }));
    const err = await r2Store(CONFIG, fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg").catch((e) => e);
    expect(err).toBeInstanceOf(R2Error);
    expect(err.status).toBe(403);
    for (const secret of [CONFIG.accessKeyId, CONFIG.secretAccessKey, CONFIG.accountId, CONFIG.bucket, KEY]) expect(err.message).not.toContain(secret);
    expect(errorSummary(err)).toBe("R2Error (status 403)");
  });

  test("a network failure is the fetch's own error", async () => {
    const fn = vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    const err = await r2Store(CONFIG, fn).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg").catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
  });
});

describe("get", () => {
  test("a signed GET without a body; the stream, the stored content type and the etag come back", async () => {
    const { seen, fetch } = fakeFetch(() => new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg", etag: '"abc123"' } }));
    const object = await r2Store(CONFIG, fetch).get(KEY);
    expect(seen).toHaveLength(1);
    const { request, body } = seen[0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe(URL_OF_KEY);
    expect(body.byteLength).toBe(0);
    expect(request.headers.get("x-amz-content-sha256")).toBe("UNSIGNED-PAYLOAD"); // nothing to hash: aws4fetch's S3 default
    expect(signatureIsValid(request, CONFIG.secretAccessKey)).toBe(true);
    expect(object).not.toBeNull();
    expect(object!.contentType).toBe("image/jpeg");
    expect(object!.etag).toBe('"abc123"');
    expect([...new Uint8Array(await new Response(object!.body).arrayBuffer())]).toEqual([...JPEG]);
  });

  test("an object stored without a content type has contentType null", async () => {
    const { fetch } = fakeFetch(() => {
      const res = new Response(JPEG, { status: 200 });
      res.headers.delete("content-type");
      return res;
    });
    expect((await r2Store(CONFIG, fetch).get(KEY))!.contentType).toBeNull();
  });

  test("404 (NoSuchKey) is null, not an error", async () => {
    const { fetch } = fakeFetch(() => new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }));
    expect(await r2Store(CONFIG, fetch).get(KEY)).toBeNull();
  });

  test("any other failure (403 wrong credentials, 500) is an R2Error with the status", async () => {
    for (const status of [403, 500, 503]) {
      const { fetch } = fakeFetch(() => new Response("no", { status }));
      const err = await r2Store(CONFIG, fetch).get(KEY).catch((e) => e);
      expect(err, String(status)).toBeInstanceOf(R2Error);
      expect(errorSummary(err)).toBe(`R2Error (status ${status})`);
    }
  });
});

describe("the address", () => {
  test("each segment of the key is encoded, so a key never changes the path it is signed for", async () => {
    const { seen, fetch } = fakeFetch();
    await r2Store(CONFIG, fetch).get("img/a b.jpg").catch(() => {});
    expect(seen[0].request.url).toBe(`https://${CONFIG.accountId}.r2.cloudflarestorage.com/${CONFIG.bucket}/img/a%20b.jpg`);
    expect(signatureIsValid(seen[0].request, CONFIG.secretAccessKey)).toBe(true);
  });
});

// In a route handler `fetch` is Next.js's own (next/dist/server/lib/patch-fetch.js over dedupe-fetch.js, as patchFetch
// installs them). Two of its steps met here: a Request handed to it absorbs the init (the AbortSignal goes into the
// Request), and a GET whose init carries no signal is deduplicated: the caller gets one branch of a tee of the response
// body, the other branch is kept for an identical fetch and never read. Cancelling such a branch waits for the other one,
// so `res.body.cancel()` on a 404 or 403 never finished and /media never answered (Vercel's 300 s time-out). These tests
// run the store through those two real functions, inside a route's work store.
describe("inside Next.js's fetch (a route handler)", () => {
  /** What patch-fetch.js reads of the work store for a force-dynamic route such as /media. */
  const ROUTE = { route: "/media/[...key]", isDraftMode: false, forceDynamic: true, forceStatic: false, isStaticGeneration: false, isBuildTimePrerendering: false, isUnstableNoStore: false } as unknown as WorkStore;
  const nextFetch = (upstream: typeof fetch) => createPatchedFetcher(createDedupeFetch(upstream), { workAsyncStorage, workUnitAsyncStorage }) as typeof fetch;
  const inRoute = <T>(fn: () => Promise<T>) => workAsyncStorage.run(ROUTE, fn);
  /** The promise, or an error when it has not settled within `ms` (the bug: it never did). */
  const within = <T>(promise: Promise<T>, ms = 2_000) =>
    Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms))]);

  test("a missing key (R2's 404) is null at once", async () => {
    const { fetch } = fakeFetch(() => new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }));
    expect(await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).get(KEY)))).toBeNull();
  });

  test("refused credentials (R2's 403) are an R2Error at once", async () => {
    const { fetch } = fakeFetch(() => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }));
    const err = await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).get(KEY)).catch((e) => e));
    expect(err).toBeInstanceOf(R2Error);
    expect(err.status).toBe(403);
  });

  test("an image still comes back whole, and R2 still gets a signed GET with the time limit", async () => {
    const { seen, fetch } = fakeFetch(() => new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } }));
    const object = await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).get(KEY)));
    expect([...new Uint8Array(await new Response(object!.body).arrayBuffer())]).toEqual([...JPEG]);
    expect(seen[0].request.url).toBe(URL_OF_KEY);
    expect(signatureIsValid(seen[0].request, CONFIG.secretAccessKey)).toBe(true);
    expect(seen[0].request.signal).toBeInstanceOf(AbortSignal);
  });

  test("an R2 that never answers is given up after 10 s (an AbortError: the route's 500)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let reached!: () => void;
      const called = new Promise<void>((resolve) => (reached = resolve));
      // like the platform's fetch: no answer, and a rejection with the signal's reason once it is aborted
      const silent = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        reached();
        return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
      }) as unknown as typeof fetch;
      let settled = false;
      const result = inRoute(() => r2Store(CONFIG, nextFetch(silent)).get(KEY)).catch((e: unknown) => e).finally(() => (settled = true));
      await called; // signed and sent: the time limit runs from here
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(((await result) as Error).name).toBe("AbortError");
    } finally {
      vi.useRealTimers();
    }
  });
});
