import { afterEach, describe, expect, test, vi } from "vitest";
import { MEDIA_CACHE, serveMedia } from "@/server/media";
import { mediaAnswer, mediaRequest, MEDIA_SOURCE_HEADER, type EdgeCache, type MediaEdge } from "@/worker/media-front";

// Uploaded images answered by the Worker entry before OpenNext (src/worker/media-front.ts, final review I1): the same
// answer as the Next route (serveMedia, plus the X-Robots-Tag of next.config.ts), from the edge cache once it has one.

const ID = "0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f";
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];
const req = (path: string, init: RequestInit = {}) => new Request(`https://mslab.example${path}`, init);

/** An R2 bucket in memory that counts its reads. */
function bucket(objects: Record<string, { bytes: number[]; contentType?: string }> = { [`img/${ID}.jpg`]: { bytes: JPEG, contentType: "image/jpeg" } }) {
  const reads: string[] = [];
  return {
    reads,
    async get(key: string) {
      reads.push(key);
      const o = objects[key];
      return o ? { body: new Blob([new Uint8Array(o.bytes)]).stream(), httpEtag: '"e1"', httpMetadata: { contentType: o.contentType } } : null;
    },
  };
}

/** The Cache API in memory, keyed by URL; waitUntil collects the writes. */
function edge(): MediaEdge & { stored: Map<string, Response>; pending: Promise<unknown>[]; keys: string[] } {
  const stored = new Map<string, Response>();
  const pending: Promise<unknown>[] = [];
  const keys: string[] = [];
  const cache: EdgeCache = {
    async match(request) {
      keys.push(request.url);
      return stored.get(request.url)?.clone();
    },
    async put(request, response) {
      // as the Cache API: the body is read in full
      stored.set(request.url, new Response(await response.arrayBuffer(), response));
    },
  };
  return { cache, waitUntil: (p) => void pending.push(p), stored, pending, keys };
}

const bytes = async (res: Response) => [...new Uint8Array(await res.arrayBuffer())];

afterEach(() => vi.restoreAllMocks());

describe("which requests the Worker answers itself", () => {
  test("GET and HEAD of /media/<anything> as the address the visitor asked for; the key decoded as Next.js decodes it", () => {
    expect(mediaRequest(req(`/media/img/${ID}.jpg`))).toBe(`img/${ID}.jpg`);
    expect(mediaRequest(req(`/media/img/${ID}.jpg?v=2`))).toBe(`img/${ID}.jpg`);
    expect(mediaRequest(req(`/media/img/${ID}.jpg`, { method: "HEAD" }))).toBe(`img/${ID}.jpg`);
    expect(mediaRequest(req(`/media/img%2F${ID}.jpg`))).toBe(`img/${ID}.jpg`);
    expect(mediaRequest(req("/media/x"))).toBe("x"); // (serveMedia answers it with a 404)
    expect(mediaRequest(req("/media/%E0%A4%A"))).toBe("%E0%A4%A"); // malformed: not a key either
  });

  test("never: other methods, other paths, or an address the middleware redirects first", () => {
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) expect(mediaRequest(req(`/media/img/${ID}.jpg`, { method })), method).toBeNull();
    for (const path of ["/media", "/media.php", "/mediakit/x", "/admin/media/x", "/koolitused", `/media/img/${ID}.jpg/`, "/media/"]) expect(mediaRequest(req(path)), path).toBeNull();
  });
});

describe("the answer", () => {
  test("a stored image: the bytes, every header of serveMedia (the route's answer), X-Robots-Tag, from R2", async () => {
    const r2 = bucket();
    const res = (await mediaAnswer(req(`/media/img/${ID}.jpg`), { MEDIA: r2 }, { cache: null, waitUntil: () => {} }))!;
    const route = await serveMedia(bucket(), `img/${ID}.jpg`);
    expect(res.status).toBe(200);
    expect(await bytes(res)).toEqual(JPEG);
    for (const [k, v] of route.headers) expect(res.headers.get(k), k).toBe(v);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe(MEDIA_CACHE);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get(MEDIA_SOURCE_HEADER)).toBe("r2");
    expect(r2.reads).toEqual([`img/${ID}.jpg`]);
  });

  test("404 as the route: a missing object, a key putImage never makes (without asking R2), with X-Robots-Tag", async () => {
    const r2 = bucket();
    for (const path of [`/media/img/${ID.replace("0f", "1f")}.jpg`, `/media/img/${ID}.svg`, "/media/seed/x.jpg", "/media/img/x.jpg", "/media/secret"]) {
      const res = (await mediaAnswer(req(path), { MEDIA: r2 }, edge()))!;
      expect(res.status, path).toBe(404);
      expect(res.headers.get("cache-control"), path).toBe("no-store");
      expect(res.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(res.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
    expect(r2.reads).toEqual([`img/${ID.replace("0f", "1f")}.jpg`]);
  });

  test("HEAD: the same status and headers, no body, never from or into the edge cache", async () => {
    const e = edge();
    const res = (await mediaAnswer(req(`/media/img/${ID}.jpg`, { method: "HEAD" }), { MEDIA: bucket() }, e))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.body).toBeNull();
    expect(e.keys).toEqual([]);
    expect(e.pending).toEqual([]);
    expect((await mediaAnswer(req("/media/img/x.jpg", { method: "HEAD" }), { MEDIA: bucket() }, e))!.status).toBe(404);
  });

  test("an R2 failure or a missing binding is a 500 that is not cached, logged without the message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { get: () => Promise.reject(new Error("R2 says: secret detail")) };
    for (const env of [{ MEDIA: failing }, {}]) {
      const res = (await mediaAnswer(req(`/media/img/${ID}.jpg`), env, edge()))!;
      expect(res.status).toBe(500);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(log.mock.calls.map((c) => c.join(" "))).toEqual(["[media] read failed: Error", "[media] read failed: Error"]);
  });
});

describe("the edge cache (Cache API)", () => {
  test("the first GET reads R2 and stores the image; the next ones come from the edge, whatever the query", async () => {
    const r2 = bucket();
    const e = edge();
    const first = (await mediaAnswer(req(`/media/img/${ID}.jpg`), { MEDIA: r2 }, e))!;
    expect(first.headers.get(MEDIA_SOURCE_HEADER)).toBe("r2");
    expect(await bytes(first)).toEqual(JPEG);
    await Promise.all(e.pending);
    expect([...e.stored.keys()]).toEqual([`https://mslab.example/media/img/${ID}.jpg`]);

    for (const path of [`/media/img/${ID}.jpg`, `/media/img/${ID}.jpg?v=1`]) {
      const again = (await mediaAnswer(req(path), { MEDIA: r2 }, e))!;
      expect(again.headers.get(MEDIA_SOURCE_HEADER), path).toBe("edge");
      expect(again.status).toBe(200);
      expect(await bytes(again)).toEqual(JPEG);
      expect(again.headers.get("cache-control")).toBe(MEDIA_CACHE);
      expect(again.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      expect(again.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(r2.reads).toEqual([`img/${ID}.jpg`]);
  });

  test("only images are stored: never a 404, and a key putImage never makes does not touch the cache", async () => {
    const e = edge();
    await mediaAnswer(req(`/media/img/${ID.replace("0f", "1f")}.jpg`), { MEDIA: bucket() }, e);
    await mediaAnswer(req("/media/img/x.jpg"), { MEDIA: bucket() }, e);
    await Promise.all(e.pending);
    expect(e.stored.size).toBe(0);
    expect(e.keys).toEqual([`https://mslab.example/media/img/${ID.replace("0f", "1f")}.jpg`]);
  });

  test("a failing edge cache is logged and the image still comes from R2", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending: Promise<unknown>[] = [];
    const broken: MediaEdge = {
      cache: { match: () => Promise.reject(new Error("cache down")), put: () => Promise.reject(new Error("cache down")) },
      waitUntil: (p) => void pending.push(p),
    };
    const res = (await mediaAnswer(req(`/media/img/${ID}.jpg`), { MEDIA: bucket() }, broken))!;
    expect(res.status).toBe(200);
    expect(await bytes(res)).toEqual(JPEG);
    await Promise.all(pending);
    expect(log.mock.calls.map((c) => c.join(" "))).toEqual(["[media] edge cache read failed: Error", "[media] edge cache write failed: Error"]);
  });
});
