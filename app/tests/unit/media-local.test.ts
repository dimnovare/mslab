import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { LOCAL_MEDIA_DIR, localStore } from "@/server/media-local";

// The development store (src/server/media-local.ts): uploaded images in a folder instead of R2. These tests use a
// temporary folder, never app/.media-local/.

const KEY = "img/0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f.jpg";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const buf = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const bytesOf = (body: ReadableStream | ArrayBuffer | Uint8Array) => new Response(body as BodyInit).arrayBuffer().then((b) => [...new Uint8Array(b)]);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mslab-media-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("localStore", () => {
  test("what is put comes back: the bytes, the content type, a stable etag", async () => {
    const store = localStore(dir);
    await store.put(KEY, buf(JPEG), "image/jpeg");
    const object = (await store.get(KEY))!;
    expect(object).not.toBeNull();
    expect(await bytesOf(object.body)).toEqual([...JPEG]);
    expect(object.contentType).toBe("image/jpeg");
    expect(object.etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect((await store.get(KEY))!.etag).toBe(object.etag);
  });

  test("the bytes are a file under the folder, at the key's own path", async () => {
    await localStore(dir).put(KEY, buf(JPEG), "image/jpeg");
    expect([...(await readFile(join(dir, ...KEY.split("/"))))]).toEqual([...JPEG]);
  });

  test("a key that was never put is null; so is a folder that does not exist yet", async () => {
    expect(await localStore(dir).get(KEY)).toBeNull();
    expect(await localStore(join(dir, "not", "there")).get(KEY)).toBeNull();
  });

  test("the folder is made on the first put", async () => {
    const store = localStore(join(dir, "fresh"));
    await store.put(KEY, buf(JPEG), "image/png");
    expect((await store.get(KEY))!.contentType).toBe("image/png");
  });

  test("a second put of the same key replaces the first", async () => {
    const store = localStore(dir);
    await store.put(KEY, buf(JPEG), "image/jpeg");
    await store.put(KEY, buf(new Uint8Array([9, 9])), "image/webp");
    const object = (await store.get(KEY))!;
    expect(await bytesOf(object.body)).toEqual([9, 9]);
    expect(object.contentType).toBe("image/webp");
  });

  test("a file dropped into the folder by hand has no content type (null), like an object stored without one", async () => {
    await mkdir(join(dir, "img"), { recursive: true });
    await writeFile(join(dir, ...KEY.split("/")), JPEG);
    const object = (await localStore(dir).get(KEY))!;
    expect(object.contentType).toBeNull();
    expect(await bytesOf(object.body)).toEqual([...JPEG]);
  });

  test("a key that leaves the folder is refused for reading and writing, and nothing is written outside", async () => {
    const store = localStore(join(dir, "inner"));
    for (const key of ["../outside.jpg", "img/../../outside.jpg", "/etc/passwd", "..\\outside.jpg", "img/..\\..\\outside.jpg", ""]) {
      await expect(store.put(key, buf(JPEG), "image/jpeg"), `put ${key}`).rejects.toThrow();
      await expect(store.get(key), `get ${key}`).rejects.toThrow();
    }
    expect(await readdir(dir)).toEqual([]);
  });

  test("delete removes the file and its type; a key that is not there is fine; a key outside the folder is refused", async () => {
    const store = localStore(dir);
    await store.put("lessons/x.pdf", new Uint8Array([1, 2]).buffer, "application/pdf");
    await store.delete("lessons/x.pdf");
    expect(await store.get("lessons/x.pdf")).toBeNull();
    expect(existsSync(join(dir, "lessons", "x.pdf.type"))).toBe(false);
    await store.delete("lessons/never.pdf");
    await expect(store.delete("../escape.pdf")).rejects.toThrow();
  });
});

describe("the default folder", () => {
  test("is app/.media-local, and git never sees it (an uploaded photo is not source)", () => {
    expect(LOCAL_MEDIA_DIR).toBe(join(process.cwd(), ".media-local"));
    expect(readFileSync(join(process.cwd(), ".gitignore"), "utf8")).toMatch(/^\/?\.media-local\/?\s*$/m);
  });
});
