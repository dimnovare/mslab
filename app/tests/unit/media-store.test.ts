import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { mediaStore } from "@/server/media-store";

// Which store holds the uploaded images: R2 when its four variables are set, otherwise a local folder in development,
// otherwise none (production without R2: uploads are refused, /media answers 404).

const R2 = { R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_ACCESS_KEY_ID: "AKIDFAKEFAKEFAKE", R2_SECRET_ACCESS_KEY: "fake-secret-access-key-for-tests", R2_BUCKET: "mslab-media" };
const NONE = { R2_ACCOUNT_ID: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined };
const KEY = "img/0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f.jpg";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mediaStore", () => {
  test("with the four R2 variables it is R2, in production and in development", async () => {
    for (const production of [true, false]) {
      const fetch = vi.fn(async () => new Response(null, { status: 404 }));
      vi.stubGlobal("fetch", fetch);
      const store = mediaStore(R2, production)!;
      expect(store, `production ${production}`).not.toBeNull();
      expect(await store.get(KEY)).toBeNull();
      const request = fetch.mock.calls[0] as unknown as [Request];
      expect(request[0].url).toBe(`https://${R2.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2.R2_BUCKET}/${KEY}`);
    }
  });

  test("without R2 variables, in development, it is a folder (a put can be read back)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mslab-store-"));
    try {
      const store = mediaStore(NONE, false, dir)!;
      expect(store).not.toBeNull();
      await store.put(KEY, new Uint8Array([0xff, 0xd8, 0xff]).buffer, "image/jpeg");
      expect((await store.get(KEY))!.contentType).toBe("image/jpeg");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("without R2 variables in production there is no store: nothing is written to a folder on a server", () => {
    expect(mediaStore(NONE, true)).toBeNull();
  });

  test("partly set R2 variables are a mistake, not a reason to use the folder: no store, and the log names the missing ones (never a value)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const production of [true, false]) {
      expect(mediaStore({ ...R2, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined }, production), `production ${production}`).toBeNull();
    }
    const lines = log.mock.calls.map((c) => c.join(" "));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain("R2_SECRET_ACCESS_KEY");
      expect(line).toContain("R2_BUCKET");
      expect(line).not.toContain("R2_ACCOUNT_ID");
      for (const value of Object.values(R2)) expect(line).not.toContain(value);
    }
  });
});
