import { describe, expect, test } from "vitest";
import { isMediaKey, MAX_IMAGE_BYTES, MEDIA_CACHE, putImage, serveMedia, UploadError, type ImageBucket } from "@/server/media";

// Task 13: the server side of an image upload. putImage trusts nothing the browser says: the declared type must be
// JPEG, PNG or WebP, the size at most 8 MB, and the first bytes must really be that kind of image (an HTML page renamed
// to .jpg is refused). The bucket is an in-memory fake of the R2 binding.

type Stored = { bytes: Uint8Array; contentType: string | undefined };

function fakeR2() {
  const store = new Map<string, Stored>();
  const bucket: ImageBucket & { store: Map<string, Stored> } = {
    store,
    async put(key, value, options) {
      store.set(key, { bytes: new Uint8Array(value), contentType: options.httpMetadata.contentType });
      return null;
    },
  };
  return bucket;
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]; // "RIFF" <size> "WEBP"
const HTML = [...new TextEncoder().encode("<!doctype html><script>alert(1)</script>")];

/** A file of `size` bytes that starts with `head`. */
function file(head: number[], size: number, type: string, name = "pilt"): File {
  const bytes = new Uint8Array(Math.max(size, head.length));
  bytes.set(head);
  return new File([bytes], name, { type });
}

const MB = 1024 * 1024;
const reason = (e: unknown) => (e instanceof UploadError ? e.reason : e);

describe("putImage", () => {
  test("rejects text/html, and stores nothing", async () => {
    const MEDIA = fakeR2();
    const err = await putImage({ MEDIA }, file(HTML, 2000, "text/html", "page.html")).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(reason(err)).toBe("type");
    expect(MEDIA.store.size).toBe(0);
  });

  test("rejects a 9 MB JPEG (the limit is 8 MB)", async () => {
    const MEDIA = fakeR2();
    expect(MAX_IMAGE_BYTES).toBe(8 * MB);
    expect(reason(await putImage({ MEDIA }, file(JPEG, 9 * MB, "image/jpeg")).catch((e) => e))).toBe("size");
    expect(reason(await putImage({ MEDIA }, file(JPEG, 8 * MB + 1, "image/jpeg")).catch((e) => e))).toBe("size");
    expect(MEDIA.store.size).toBe(0);
  });

  test("accepts a 1 MB JPEG: key img/<uuid>.jpg, the bytes and the content type are stored", async () => {
    const MEDIA = fakeR2();
    const upload = file(JPEG, MB, "image/jpeg", "IMG_0001.JPG");
    const { key } = await putImage({ MEDIA }, upload);
    expect(key).toMatch(/^img\/[0-9a-f-]{36}\.jpg$/);
    expect(isMediaKey(key)).toBe(true);
    const stored = MEDIA.store.get(key)!;
    expect(stored.contentType).toBe("image/jpeg");
    expect(stored.bytes.byteLength).toBe(MB);
    expect([...stored.bytes.slice(0, 4)]).toEqual(JPEG);
    // the visitor's file name is not part of the key
    expect(key).not.toContain("IMG_0001");
  });

  test("an 8 MB image is still accepted; every upload gets its own key", async () => {
    const MEDIA = fakeR2();
    const a = await putImage({ MEDIA }, file(JPEG, 8 * MB, "image/jpeg"));
    const b = await putImage({ MEDIA }, file(JPEG, 10, "image/jpeg"));
    expect(a.key).not.toBe(b.key);
    expect(MEDIA.store.size).toBe(2);
  });

  test("PNG and WebP keep their own extension and content type", async () => {
    const MEDIA = fakeR2();
    const png = await putImage({ MEDIA }, file(PNG, 500, "image/png"));
    const webp = await putImage({ MEDIA }, file(WEBP, 500, "image/webp"));
    expect(png.key).toMatch(/^img\/[0-9a-f-]{36}\.png$/);
    expect(webp.key).toMatch(/^img\/[0-9a-f-]{36}\.webp$/);
    expect(MEDIA.store.get(png.key)!.contentType).toBe("image/png");
    expect(MEDIA.store.get(webp.key)!.contentType).toBe("image/webp");
  });

  test("the first bytes must match the declared type: HTML renamed to .jpg, a PNG sent as JPEG, RIFF that is not WebP", async () => {
    const MEDIA = fakeR2();
    const cases: [number[], string][] = [
      [HTML, "image/jpeg"],
      [HTML, "image/png"],
      [HTML, "image/webp"],
      [PNG, "image/jpeg"],
      [JPEG, "image/png"],
      [JPEG, "image/webp"],
      [[0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x41, 0x56, 0x45], "image/webp"], // RIFF....WAVE
      [[0xff, 0xd8], "image/jpeg"], // too short to be a JPEG
    ];
    for (const [head, type] of cases) {
      const err = await putImage({ MEDIA }, file(head, head.length, type, "x.jpg")).catch((e) => e);
      expect(reason(err), `${type} ${head.slice(0, 4)}`).toBe("content");
    }
    expect(MEDIA.store.size).toBe(0);
  });

  test("an empty file and other image types (SVG, GIF, HEIC) are refused", async () => {
    const MEDIA = fakeR2();
    expect(reason(await putImage({ MEDIA }, new File([], "x.jpg", { type: "image/jpeg" })).catch((e) => e))).toBe("empty");
    for (const type of ["image/svg+xml", "image/gif", "image/heic", "", "application/octet-stream"]) {
      expect(reason(await putImage({ MEDIA }, file(JPEG, 100, type)).catch((e) => e)), type).toBe("type");
    }
    expect(MEDIA.store.size).toBe(0);
  });
});

describe("serveMedia (GET /media/<key>)", () => {
  const id = "0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f";
  const source = (objects: Record<string, { bytes: number[]; contentType?: string }>) => ({
    requested: [] as string[],
    async get(key: string) {
      this.requested.push(key);
      const o = objects[key];
      if (!o) return null;
      return { body: new Blob([new Uint8Array(o.bytes)]).stream(), httpEtag: '"e1"', httpMetadata: o.contentType ? { contentType: o.contentType } : undefined };
    },
  });

  test("an uploaded image: the bytes, the stored type, nosniff and a year of immutable caching", async () => {
    const r2 = source({ [`img/${id}.jpg`]: { bytes: JPEG, contentType: "image/jpeg" } });
    const res = await serveMedia(r2, `img/${id}.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("cache-control")).toBe(MEDIA_CACHE);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("etag")).toBe('"e1"');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(JPEG);
  });

  test("a stored type that is not the key's image type is not passed on (the extension decides)", async () => {
    const r2 = source({ [`img/${id}.png`]: { bytes: PNG, contentType: "text/html" }, [`img/${id}.webp`]: { bytes: WEBP } });
    expect((await serveMedia(r2, `img/${id}.png`)).headers.get("content-type")).toBe("image/png");
    expect((await serveMedia(r2, `img/${id}.webp`)).headers.get("content-type")).toBe("image/webp");
  });

  test("404 for a missing object, and for any other key without asking R2", async () => {
    const r2 = source({ "seed/x.jpg": { bytes: JPEG, contentType: "image/jpeg" } });
    const missing = await serveMedia(r2, `img/${id}.jpg`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    r2.requested.length = 0;
    for (const key of ["seed/x.jpg", `img/${id}.svg`, "img/../secret", "", `img/${id}.jpg/..`]) expect((await serveMedia(r2, key)).status, key).toBe(404);
    expect(r2.requested).toEqual([]);
  });
});

describe("isMediaKey (what /media serves)", () => {
  test("only img/<uuid>.<jpg|png|webp>", () => {
    const id = "0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f";
    for (const ext of ["jpg", "png", "webp"]) expect(isMediaKey(`img/${id}.${ext}`), ext).toBe(true);
    for (const bad of [
      `img/${id}.svg`,
      `img/${id}.html`,
      `img/${id}.JPG`,
      `img/${id.toUpperCase()}.jpg`,
      `img/${id}.jpg/x`,
      `x/${id}.jpg`,
      `img/../${id}.jpg`,
      `img/${id}`,
      `img/abc.jpg`,
      `/img/${id}.jpg`,
      `img/${id}.jpg\n`,
      "",
    ])
      expect(isMediaKey(bad), JSON.stringify(bad)).toBe(false);
  });
});
