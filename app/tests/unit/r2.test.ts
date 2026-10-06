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

/** The promise, or an error when it has not settled within `ms` (the bug that /media had: it never did). */
const within = <T>(promise: Promise<T>, ms = 2_000) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms))]);

// Whatever sits between the store and R2 (a tee, a wrapper), the bodies the store throws away are not waited for: it
// answers at once, also when cancelling a body never finishes. (A branch of a tee does that when its sibling is unread.)
describe("a body that never finishes cancelling does not hold the answer back", () => {
  /** An answer whose body can be read but whose cancel() never settles. */
  const stuck = (status: number) => {
    const body = new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new TextEncoder().encode("<Error/>")), cancel: () => new Promise<void>(() => {}) });
    return new Response(body, { status });
  };

  test("the stuck body really is stuck (the tests below would prove nothing otherwise)", async () => {
    const settled = await Promise.race([stuck(404).body!.cancel().then(() => "cancelled"), new Promise<string>((r) => setTimeout(() => r("stuck"), 100))]);
    expect(settled).toBe("stuck");
  });

  test("get: a 404 is null and a 403 an R2Error, at once", async () => {
    expect(await within(r2Store(CONFIG, fakeFetch(() => stuck(404)).fetch).get(KEY))).toBeNull();
    const err = await within(r2Store(CONFIG, fakeFetch(() => stuck(403)).fetch).get(KEY).catch((e) => e));
    expect(err).toBeInstanceOf(R2Error);
    expect(err.status).toBe(403);
  });

  test("put: a 200 is done and a 403 an R2Error, at once", async () => {
    await within(r2Store(CONFIG, fakeFetch(() => stuck(200)).fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg"));
    const err = await within(r2Store(CONFIG, fakeFetch(() => stuck(403)).fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg").catch((e) => e));
    expect(err).toBeInstanceOf(R2Error);
    expect(err.status).toBe(403);
  });

  test("delete: a 2xx and a 404 are done and a 403 an R2Error, at once (a 204 has no body: any 2xx stands for it)", async () => {
    await within(r2Store(CONFIG, fakeFetch(() => stuck(200)).fetch).delete(KEY));
    await within(r2Store(CONFIG, fakeFetch(() => stuck(404)).fetch).delete(KEY));
    const err = await within(r2Store(CONFIG, fakeFetch(() => stuck(403)).fetch).delete(KEY).catch((e) => e));
    expect(err).toBeInstanceOf(R2Error);
    expect(err.status).toBe(403);
    expect(errorSummary(err)).toBe("R2Error (status 403)");
  });

  test("a body that refuses to cancel (a rejected cancel) is no failure either", async () => {
    const body = new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new Uint8Array([1])), cancel: () => Promise.reject(new Error("no")) });
    expect(await within(r2Store(CONFIG, fakeFetch(() => new Response(body, { status: 404 })).fetch).get(KEY))).toBeNull();
  });
});

// The signing key (four HMACs) depends on the secret and the day only: it is derived once for every request of a function
// instance, also though mediaStore() makes a new store for each of them.
describe("the signing key", () => {
  test("is derived once a day, not once a request, across stores", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    const config = { ...CONFIG, secretAccessKey: "a-secret-that-no-other-test-uses" };
    const importKey = vi.spyOn(crypto.subtle, "importKey");
    try {
      const { fetch } = fakeFetch();
      await r2Store(config, fetch).get(KEY);
      const first = importKey.mock.calls.length; // the key's four steps and the signature itself
      expect(first).toBeGreaterThan(1);
      await r2Store(config, fetch).get(KEY);
      await r2Store(config, fetch).get(KEY);
      expect(importKey.mock.calls.length - first).toBe(2); // one HMAC for each signature, the key is not derived again
      vi.setSystemTime(new Date("2026-10-04T00:00:01Z")); // the next day: a new key
      await r2Store(config, fetch).get(KEY);
      expect(importKey.mock.calls.length - first).toBe(2 + first);
    } finally {
      importKey.mockRestore();
      vi.useRealTimers();
    }
  });
});

// In a route handler `fetch` is Next.js's own (next/dist/server/lib/patch-fetch.js over dedupe-fetch.js, as patchFetch
// installs them). Two of its steps met here: a Request handed to it absorbs the init (the AbortSignal goes into the
// Request), and a GET whose init carries no signal is deduplicated: the caller gets one branch of a tee of the response
// body, and the other branch stays unread, released only at garbage collection. Cancelling such a branch waits for the
// other one, so `res.body.cancel()` on a 404 or 403 never finished and /media never answered (Vercel's 300 s time-out).
// These tests run the store through those two real functions, inside a route's work store.
describe("inside Next.js's fetch (a route handler)", () => {
  /** What patch-fetch.js reads of the work store for a force-dynamic route such as /media. */
  const ROUTE = { route: "/media/[...key]", isDraftMode: false, forceDynamic: true, forceStatic: false, isStaticGeneration: false, isBuildTimePrerendering: false, isUnstableNoStore: false } as unknown as WorkStore;
  const nextFetch = (upstream: typeof fetch) => createPatchedFetcher(createDedupeFetch(upstream), { workAsyncStorage, workUnitAsyncStorage }) as typeof fetch;
  const inRoute = <T>(fn: () => Promise<T>) => workAsyncStorage.run(ROUTE, fn);

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
    // the init that Next.js's fetch hands on to the platform's fetch carries the signal (the request's own signal is
    // always set, so it would prove nothing): it is what keeps the response from being a tee branch
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
    expect(seen[0].signal!.aborted).toBe(false);
  });

  test("a PUT (R2's 200) is done at once: the signed bytes and the content type arrive", async () => {
    const { seen, fetch } = fakeFetch(() => new Response(null, { status: 200 }));
    await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg")));
    expect(seen).toHaveLength(1);
    const { request, body, signal } = seen[0];
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(URL_OF_KEY);
    expect(request.headers.get("content-type")).toBe("image/jpeg");
    expect([...body]).toEqual([...JPEG]);
    expect(request.headers.get("x-amz-content-sha256")).toBe(sha256hex(JPEG));
    expect(signatureIsValid(request, CONFIG.secretAccessKey)).toBe(true);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  test("a PUT refused (R2's 403) is an R2Error at once", async () => {
    const { fetch } = fakeFetch(() => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }));
    const err = await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg")).catch((e) => e));
    expect(err).toBeInstanceOf(R2Error);
    expect(err.status).toBe(403);
    expect(errorSummary(err)).toBe("R2Error (status 403)");
  });

  test("a DELETE (R2's 204, or 404 for a key that is gone) is done at once: a signed request with the time limit", async () => {
    for (const status of [204, 404]) {
      const { seen, fetch } = fakeFetch(() => new Response(status === 404 ? "<Error><Code>NoSuchKey</Code></Error>" : null, { status }));
      await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).delete(KEY)));
      expect(seen).toHaveLength(1);
      const { request, signal } = seen[0];
      expect(request.method).toBe("DELETE");
      expect(request.url).toBe(URL_OF_KEY);
      expect(signatureIsValid(request, CONFIG.secretAccessKey)).toBe(true);
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });

  test("a DELETE refused (R2's 403) is an R2Error at once", async () => {
    const { fetch } = fakeFetch(() => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }));
    const err = await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).delete(KEY)).catch((e) => e));
    expect(err).toBeInstanceOf(R2Error);
    expect(err.status).toBe(403);
    expect(errorSummary(err)).toBe("R2Error (status 403)");
  });

  test("a PUT with a Content-Disposition (a lesson file) still reaches R2 with its header, signed", async () => {
    const { seen, fetch } = fakeFetch(() => new Response(null, { status: 200 }));
    await within(inRoute(() => r2Store(CONFIG, nextFetch(fetch)).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "application/pdf", 'attachment; filename="a.pdf"')));
    expect(seen[0].request.headers.get("content-disposition")).toBe('attachment; filename="a.pdf"');
    expect(signatureIsValid(seen[0].request, CONFIG.secretAccessKey)).toBe(true);
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

  // The canary. r2.ts sends the signed request as an address and an init because Next.js's fetch treats the old call
  // shape, fetch(new Request(url), { signal }), badly: it folds the signal into the Request, deduplicates the GET and hands
  // back one branch of a tee (an own `url` property: cloneResponse's mark), whose cancel() waits for an unread sibling.
  // This test keeps that observation alive. It passes while Next.js still does so; when it fails, Next.js has changed, and
  // the workaround (r2.ts send() and discard()) and the tests around it need a second look, probably to be simplified.
  test("canary: Next.js's fetch still tees the response of the old call shape, fetch(new Request(url), { signal })", async () => {
    const { fetch } = fakeFetch(() => new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }));
    const controller = new AbortController();
    const res = await within(inRoute(() => nextFetch(fetch)(new Request(URL_OF_KEY), { signal: controller.signal })));
    const ownUrl = Object.prototype.hasOwnProperty.call(res, "url"); // a platform Response has `url` on its prototype
    const cancelled = ownUrl || (await Promise.race([res.body!.cancel().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 300))]));
    expect(
      ownUrl || cancelled === false,
      "Next.js changed: its patched fetch no longer tees the response of fetch(new Request(url), { signal }) (no own url property, and cancel() of the body answers). " +
        "The R2 workaround in src/server/r2.ts (address and init, discard of unread bodies) and its tests in this file need review.",
    ).toBe(true);
  });
});

describe("delete and the signed address of one object (lesson files)", () => {
  test("delete: a signed DELETE of the key; 204 and 404 are fine, 403 is an R2Error", async () => {
    const { seen, fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    await r2Store(CONFIG, fetch).delete(KEY);
    expect(seen[0].request.method).toBe("DELETE");
    expect(seen[0].request.url).toBe(URL_OF_KEY);
    expect(seen[0].request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
    await r2Store(CONFIG, fakeFetch(() => new Response(null, { status: 404 })).fetch).delete(KEY);
    await expect(r2Store(CONFIG, fakeFetch(() => new Response(null, { status: 403 })).fetch).delete(KEY)).rejects.toThrow(new R2Error("delete", 403));
  });

  test("put with a disposition sends it as Content-Disposition (kept with the object; the signed GET answers with it)", async () => {
    const { seen, fetch } = fakeFetch();
    await r2Store(CONFIG, fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "application/pdf", 'attachment; filename="a.pdf"');
    expect(seen[0].request.headers.get("content-disposition")).toBe('attachment; filename="a.pdf"');
  });

  test("the disposition is signed with the request (the signature fails without it), and without one no such header is sent", async () => {
    const withDisposition = fakeFetch();
    await r2Store(CONFIG, withDisposition.fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "application/pdf", 'attachment; filename="a.pdf"');
    const { request, body } = withDisposition.seen[0];
    expect(signatureIsValid(request, CONFIG.secretAccessKey)).toBe(true);
    expect(/SignedHeaders=([^,]+)/.exec(request.headers.get("authorization")!)![1].split(";")).toContain("content-disposition");
    const headers = new Headers(request.headers);
    headers.set("content-disposition", "attachment; filename=\"other.pdf\"");
    expect(signatureIsValid(new Request(request.url, { method: "PUT", headers, body }), CONFIG.secretAccessKey)).toBe(false);
    const without = fakeFetch();
    await r2Store(CONFIG, without.fetch).put(KEY, JPEG.buffer.slice(0) as ArrayBuffer, "image/jpeg");
    expect(without.seen[0].request.headers.get("content-disposition")).toBeNull();
  });

  test("delete is signed like the other calls (valid for its secret and no other)", async () => {
    const { seen, fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    await r2Store(CONFIG, fetch).delete(KEY);
    expect(signatureIsValid(seen[0].request, CONFIG.secretAccessKey)).toBe(true);
    expect(signatureIsValid(seen[0].request, "another-secret")).toBe(false);
  });

  test("signedGetUrl: a presigned GET for 300 s (query signature over the host), made without any request", async () => {
    const { seen, fetch } = fakeFetch();
    const href = await r2Store(CONFIG, fetch).signedGetUrl!(KEY, { expiresSec: 300 });
    expect(seen).toHaveLength(0);
    const url = new URL(href);
    expect(`${url.origin}${url.pathname}`).toBe(URL_OF_KEY);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(presignIsValid(href, CONFIG.secretAccessKey)).toBe(true);
    expect(presignIsValid(href, "another-secret")).toBe(false);
  });

  test("signedGetUrl: any key is encoded per segment, the expiry is the one asked for, the secret is not in the address, and it is not valid for another path", async () => {
    const { fetch } = fakeFetch();
    const href = await r2Store(CONFIG, fetch).signedGetUrl!("lessons/a b.pdf", { expiresSec: 60 });
    const url = new URL(href);
    expect(url.pathname).toBe(`/${CONFIG.bucket}/lessons/a%20b.pdf`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(href).not.toContain(CONFIG.secretAccessKey);
    expect(presignIsValid(href, CONFIG.secretAccessKey)).toBe(true);
    const other = new URL(href);
    other.pathname = `/${CONFIG.bucket}/lessons/other.pdf`;
    expect(presignIsValid(other.toString(), CONFIG.secretAccessKey)).toBe(false);
  });
});

/** RFC 3986 encoding as SigV4 wants it. */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** An independent check of a presigned (query-signed) GET, written from the AWS SigV4 documentation, not aws4fetch. */
function presignIsValid(href: string, secret: string): boolean {
  const url = new URL(href);
  const q = url.searchParams;
  const m = /^[^/]+\/(\d{8})\/auto\/s3\/aws4_request$/.exec(q.get("X-Amz-Credential") ?? "");
  if (!m) return false;
  const canonicalQuery = [...q]
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => [enc(k), enc(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = ["GET", url.pathname, canonicalQuery, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", q.get("X-Amz-Date"), `${m[1]}/auto/s3/aws4_request`, sha256hex(canonicalRequest)].join("\n");
  const signingKey = ["auto", "s3", "aws4_request"].reduce((key, part) => hmac(key, part), hmac(`AWS4${secret}`, m[1]));
  return hmac(signingKey, stringToSign).toString("hex") === q.get("X-Amz-Signature");
}
