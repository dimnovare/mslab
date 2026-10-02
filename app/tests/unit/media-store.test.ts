import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mediaStore } from "@/server/media-store";

// Which store holds the uploaded images: R2 when its four variables are set, otherwise a local folder in development (or
// in a production build with MEDIA_LOCAL=1, except on Vercel, where VERCEL is set and MEDIA_LOCAL is ignored), otherwise
// none (production without R2: uploads are refused, /media 404).

const R2 = { R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_ACCESS_KEY_ID: "AKIDFAKEFAKEFAKE", R2_SECRET_ACCESS_KEY: "fake-secret-access-key-for-tests", R2_BUCKET: "mslab-media" };
const NONE = { R2_ACCOUNT_ID: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined };
const KEY = "img/0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f.jpg";

const NOTES = "__mslabMediaNotes";
const forgetNotes = () => delete (globalThis as Record<string, unknown>)[NOTES];
beforeEach(() => {
  forgetNotes();
  vi.stubEnv("VERCEL", undefined); // these tests run on a developer machine or in CI, never "on Vercel" unless one says so
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetNotes();
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
    for (const value of [undefined, "0", "yes", "true"]) expect(mediaStore({ ...NONE, MEDIA_LOCAL: value }, true), String(value)).toBeNull();
  });

  test("MEDIA_LOCAL=1: the production build on this machine (next start, the e2e run) uses the folder too; R2 still wins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mslab-store-"));
    try {
      const store = mediaStore({ ...NONE, MEDIA_LOCAL: "1" }, true, dir)!;
      expect(store).not.toBeNull();
      await store.put(KEY, new Uint8Array([0xff, 0xd8, 0xff]).buffer, "image/jpeg");
      expect((await store.get(KEY))!.contentType).toBe("image/jpeg");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    expect(await mediaStore({ ...R2, MEDIA_LOCAL: "1" }, true)!.get(KEY)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    // partly set R2 stays a mistake: no store
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mediaStore({ ...R2, R2_BUCKET: undefined, MEDIA_LOCAL: "1" }, true)).toBeNull();
  });

  test("MEDIA_LOCAL=1 is ignored on Vercel (VERCEL is set): no folder on a function, so no store; R2 and development are not affected", async () => {
    vi.stubEnv("VERCEL", "1");
    // the same answer as without MEDIA_LOCAL: uploads refused (503 storage), /media 404
    expect(mediaStore({ ...NONE, MEDIA_LOCAL: "1" }, true)).toBeNull();
    // R2 still wins, and a development run keeps its folder
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    expect(await mediaStore({ ...R2, MEDIA_LOCAL: "1" }, true)!.get(KEY)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    const dir = await mkdtemp(join(tmpdir(), "mslab-store-"));
    try {
      expect(mediaStore({ ...NONE, MEDIA_LOCAL: "1" }, false, dir)).not.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    // off Vercel (VERCEL unset or empty) MEDIA_LOCAL=1 works as before
    for (const vercel of [undefined, ""]) {
      vi.stubEnv("VERCEL", vercel);
      const local = await mkdtemp(join(tmpdir(), "mslab-store-"));
      try {
        expect(mediaStore({ ...NONE, MEDIA_LOCAL: "1" }, true, local), `VERCEL=${vercel}`).not.toBeNull();
      } finally {
        await rm(local, { recursive: true, force: true });
      }
    }
  });

  test("partly set R2 variables are a mistake, not a reason to use the folder: no store, in production and in development", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const production of [true, false]) {
      expect(mediaStore({ ...R2, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined }, production), `production ${production}`).toBeNull();
    }
  });

  test("...and the log names the missing ones (never a value), once per process, not on every request", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const partial = { ...R2, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined };
    for (let request = 0; request < 50; request++) expect(mediaStore(partial, true)).toBeNull();
    const lines = log.mock.calls.map((c) => c.join(" "));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("R2_SECRET_ACCESS_KEY");
    expect(lines[0]).toContain("R2_BUCKET");
    expect(lines[0]).not.toContain("R2_ACCOUNT_ID");
    for (const value of Object.values(R2)) expect(lines[0]).not.toContain(value);
    // another mistake is another note, also once
    mediaStore({ ...R2, R2_ACCOUNT_ID: undefined }, true);
    mediaStore({ ...R2, R2_ACCOUNT_ID: undefined }, false);
    expect(log.mock.calls.map((c) => c.join(" "))).toHaveLength(2);
    expect(String(log.mock.calls[1][0])).toContain("R2_ACCOUNT_ID");
  });

  test("a module evaluated again (a hot reload, another server chunk) does not repeat the note", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const partial = { ...R2, R2_BUCKET: undefined };
    for (let i = 0; i < 3; i++) {
      vi.resetModules();
      const { mediaStore: again } = await import("@/server/media-store");
      again(partial, true);
    }
    expect(log).toHaveBeenCalledTimes(1);
  });
});
