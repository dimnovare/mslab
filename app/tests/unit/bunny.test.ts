import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { bunnyApi, BunnyError, bunnyConfig, embedToken, lessonVideoStatus, signedEmbedUrl, tusSignature } from "@/server/bunny";

const VIDEO = "11111111-2222-3333-4444-555555555555";
const ENV = { BUNNY_LIBRARY_ID: "12345", BUNNY_API_KEY: "test-api-key", BUNNY_TOKEN_KEY: "test-token-key" };
const CONFIG = bunnyConfig(ENV, false)!;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("signing", () => {
  test("tus (reference/tus-resumable-uploads): sha256 of library id + API key + expiry + video id, lowercase hex", async () => {
    expect(await tusSignature("12345", "test-api-key", 1767225600, VIDEO)).toBe("a6abfdd5d725736f86b8233000c5ba454075e9f9d222198aad1bf74e01fc62ee");
    expect(await tusSignature("12345", "test-api-key", 1767225600, VIDEO)).toBe(sha(`12345test-api-key1767225600${VIDEO}`));
  });
  test("embed token (stream/token-authentication): sha256 of token key + video id + expiry", async () => {
    expect(await embedToken("test-token-key", VIDEO, 1767225600)).toBe("adebd867cd8a745b86fb42b2337b4488d397ad9134efbb4a7da8ed5869a55e48");
  });
  test("the embed URL: player.mediadelivery.net, token, expiry, autoplay off; t only for a resume point (whole seconds)", async () => {
    const url = new URL(await signedEmbedUrl(CONFIG, VIDEO, 1767225600));
    expect(`${url.origin}${url.pathname}`).toBe(`https://player.mediadelivery.net/embed/12345/${VIDEO}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ token: "adebd867cd8a745b86fb42b2337b4488d397ad9134efbb4a7da8ed5869a55e48", expires: "1767225600", autoplay: "false" });
    expect(new URL(await signedEmbedUrl(CONFIG, VIDEO, 1767225600, 95.7)).searchParams.get("t")).toBe("95");
  });
});

describe("bunnyConfig", () => {
  test("all three settings, or no video ('Video seadistamata')", () => {
    expect(bunnyConfig({}, false)).toBeNull();
    expect(bunnyConfig({ ...ENV, BUNNY_TOKEN_KEY: undefined }, false)).toBeNull();
    expect(CONFIG).toEqual({
      libraryId: "12345", apiKey: "test-api-key", tokenKey: "test-token-key", webhookSecret: null,
      apiBase: "https://video.bunnycdn.com", tusEndpoint: "https://video.bunnycdn.com/tusupload", embedBase: "https://player.mediadelivery.net/embed",
    });
    expect(bunnyConfig({ ...ENV, BUNNY_WEBHOOK_SECRET: "s" }, false)?.webhookSecret).toBe("s");
  });
  test("BUNNY_FAKE_URL (the e2e run's fake) replaces the three addresses, and is ignored on Vercel", () => {
    const fake = { ...ENV, BUNNY_FAKE_URL: "http://localhost:3998/" };
    expect(bunnyConfig(fake, false)).toMatchObject({ apiBase: "http://localhost:3998", tusEndpoint: "http://localhost:3998/tusupload", embedBase: "http://localhost:3998/embed" });
    expect(bunnyConfig(fake, true)).toMatchObject({ apiBase: "https://video.bunnycdn.com", embedBase: "https://player.mediadelivery.net/embed" });
  });
});

/** A fetch that records the calls and answers with `respond`. */
function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; method: string; headers: Headers; body: unknown; signal: AbortSignal | null | undefined }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined, signal: init.signal });
    return respond(url, init);
  });
  return { calls, fetch: fn as unknown as typeof fetch };
}

describe("the API client", () => {
  test("createVideo: POST …/library/<id>/videos with the AccessKey and the title; answers the guid", async () => {
    const f = fakeFetch(() => Response.json({ guid: VIDEO, status: 0 }));
    expect(await bunnyApi(CONFIG, f.fetch).createVideo("Kulmud · Sissejuhatus")).toBe(VIDEO);
    expect(f.calls[0]).toMatchObject({ url: "https://video.bunnycdn.com/library/12345/videos", method: "POST", body: { title: "Kulmud · Sissejuhatus" } });
    expect(f.calls[0].headers.get("accesskey")).toBe("test-api-key");
    expect(f.calls[0].signal).toBeInstanceOf(AbortSignal); // a timeout, and Next.js's fetch does not deduplicate a call with a signal (server/r2.ts)
  });
  test("createVideo without a guid in the answer, or with an error status, is a BunnyError", async () => {
    await expect(bunnyApi(CONFIG, fakeFetch(() => Response.json({})).fetch).createVideo("x")).rejects.toThrow(new BunnyError("create", 200));
    await expect(bunnyApi(CONFIG, fakeFetch(() => new Response("no", { status: 401 })).fetch).createVideo("x")).rejects.toThrow(new BunnyError("create", 401));
  });
  test("getVideo: status and length; null for an unknown video (404)", async () => {
    const f = fakeFetch((url) => (url.endsWith(VIDEO) ? Response.json({ guid: VIDEO, status: 4, length: 754, title: "x" }) : new Response("", { status: 404 })));
    const api = bunnyApi(CONFIG, f.fetch);
    expect(await api.getVideo(VIDEO)).toEqual({ status: 4, length: 754 });
    expect(await api.getVideo("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(f.calls[0]).toMatchObject({ url: `https://video.bunnycdn.com/library/12345/videos/${VIDEO}`, method: "GET" });
  });
  test("deleteVideo: DELETE; 404 counts as gone; another status is an error that names the operation and status only", async () => {
    const ok = fakeFetch(() => Response.json({ success: true }));
    await bunnyApi(CONFIG, ok.fetch).deleteVideo(VIDEO);
    expect(ok.calls[0]).toMatchObject({ url: `https://video.bunnycdn.com/library/12345/videos/${VIDEO}`, method: "DELETE" });
    await bunnyApi(CONFIG, fakeFetch(() => new Response("", { status: 404 })).fetch).deleteVideo(VIDEO);
    const err = await bunnyApi(CONFIG, fakeFetch(() => new Response("key test-api-key", { status: 401 })).fetch).deleteVideo(VIDEO).catch((e) => e);
    expect(err).toEqual(new BunnyError("delete", 401));
    expect(String(err.message)).not.toContain("test-api-key");
  });
});

test.each([
  [0, "uploading"], [1, "processing"], [2, "processing"], [3, "processing"], [4, "ready"], [5, "failed"], [6, "failed"], [7, "processing"], [8, "processing"],
] as const)("Bunny status %i → %s", (n, status) => expect(lessonVideoStatus(n)).toBe(status));
