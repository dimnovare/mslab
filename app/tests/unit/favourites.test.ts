import { describe, expect, test, vi } from "vitest";
import {
  ACCOUNT_FAVOURITES_KEY, FAVOURITES_EVENT, FAVOURITES_KEY, FAVOURITES_MERGED_EVENT, MERGE_LIMIT, afterAccountLoad, answerFavourites, forgetAccountFavourites,
  mergeBrowserFavourites, mergeSlugs, parseAccountFavourites, readAccountFavourites, rememberAccountFavourites, setAccountFavourite, withFavourite, type FavouriteIo,
  type StorageLike,
} from "@/lib/favourites";

// The favourites in the browser (lib/favourites.ts) once there is an account: the browser's own list (localStorage "mslab-fav") is
// merged into the account once, after the first account page has loaded, and cleared only when the server said 200 (dropped after a
// 400); the account's list is kept in this browser (localStorage "mslab-account-fav") for the course pages' ♡, which writes the account
// (optimistic, one request per course at a time, put back on a failure, the browser's list again when the session has ended). Storage
// and fetch are fakes here.

/** A Storage stand-in (a Map). */
function memory(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}
/** A storage that throws on every use (blocked site data). */
const blocked: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function io(opts: { local?: Record<string, string>; answer?: (url: string, init?: RequestInit) => Promise<Response> } = {}) {
  const local = memory(opts.local);
  const fetch = vi.fn(opts.answer ?? (async () => json(200, { ok: true, favourites: [] })));
  const emit = vi.fn();
  /** The hint cookie: signed in unless a test signs out ("Logi välja" while an answer is on its way). */
  const hint = { signedIn: true };
  const value: FavouriteIo = { local, fetch: fetch as unknown as typeof globalThis.fetch, emit, signedIn: () => hint.signedIn };
  return { io: value, local, fetch, emit, hint };
}

const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));
const copyOf = (t: ReturnType<typeof io>) => t.local.map.get(ACCOUNT_FAVOURITES_KEY);

describe("the lists", () => {
  test("the account's copy: null when there is none (or it is not a list), else its strings", () => {
    expect(parseAccountFavourites(null)).toBeNull();
    expect(parseAccountFavourites(undefined)).toBeNull();
    expect(parseAccountFavourites("not json")).toBeNull();
    expect(parseAccountFavourites('{"a":1}')).toBeNull();
    expect(parseAccountFavourites("[]")).toEqual([]);
    expect(parseAccountFavourites('["a", 3, "", "b", "a"]')).toEqual(["a", "b"]);
  });

  test("what a merge sends: nothing for an empty or broken list; each slug once; the 100 hearted last", () => {
    expect(mergeSlugs(null)).toBeNull();
    expect(mergeSlugs("[]")).toBeNull();
    expect(mergeSlugs("not json")).toBeNull();
    expect(mergeSlugs('["lami", "lami", "botox"]')).toEqual(["lami", "botox"]);
    const many = Array.from({ length: 150 }, (_, i) => `k${i}`);
    expect(MERGE_LIMIT).toBe(100);
    expect(mergeSlugs(JSON.stringify(many))).toEqual(many.slice(50));
  });

  test("what a merge sends is what the API takes: slugs of at most 200 characters, text Postgres can store; nothing left is nothing sent", () => {
    const long = "x".repeat(201);
    const fine = "y".repeat(200);
    expect(mergeSlugs(JSON.stringify(["lami", long, "nul\u0000", "lone\ud800", "bell\u0007", fine]))).toEqual(["lami", fine]);
    expect(mergeSlugs(JSON.stringify([long, "nul\u0000"]))).toBeNull();
    // the 100 are counted after the filter
    const many = [...Array.from({ length: 100 }, (_, i) => `k${i}`), long];
    expect(mergeSlugs(JSON.stringify(many))).toEqual(many.slice(0, 100));
  });

  test("withFavourite puts a course first (the account lists the newest first) or takes it out", () => {
    expect(withFavourite(["a", "b"], "c", true)).toEqual(["c", "a", "b"]);
    expect(withFavourite(["a", "b"], "b", true)).toEqual(["b", "a"]);
    expect(withFavourite(["a", "b"], "a", false)).toEqual(["b"]);
    expect(withFavourite([], "a", false)).toEqual([]);
  });

  test("an answer's favourites: its strings, or null when it has no list", () => {
    expect(answerFavourites({ favourites: ["a", 1, "b"] })).toEqual(["a", "b"]);
    expect(answerFavourites({ favourites: [] })).toEqual([]);
    expect(answerFavourites({ client: {} })).toBeNull();
    expect(answerFavourites(null)).toBeNull();
    expect(answerFavourites([])).toBeNull();
  });

  test("the copy is kept in localStorage, written and forgotten (the key gone) with an event; blocked storage is no copy", () => {
    const t = io();
    expect(readAccountFavourites(t.io)).toBeNull();
    rememberAccountFavourites(["a"], t.io);
    expect(copyOf(t)).toBe('["a"]');
    expect(readAccountFavourites(t.io)).toEqual(["a"]);
    forgetAccountFavourites(t.io);
    expect(t.local.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false);
    expect(t.emit).toHaveBeenCalledTimes(2);
    expect(t.emit).toHaveBeenCalledWith(FAVOURITES_EVENT);
    const none: FavouriteIo = { ...t.io, local: blocked };
    expect(readAccountFavourites(none)).toBeNull();
    expect(() => rememberAccountFavourites(["a"], none)).not.toThrow();
    expect(readAccountFavourites({ ...t.io, local: null })).toBeNull();
  });

  test("no copy is written while signed out (the hint cookie gone)", () => {
    const t = io();
    t.hint.signedIn = false;
    rememberAccountFavourites(["a"], t.io);
    expect(t.local.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false);
    expect(t.emit).not.toHaveBeenCalled();
  });
});

describe("mergeBrowserFavourites: once, after the first account load", () => {
  test("nothing in this browser: no request", async () => {
    const stored: Record<string, string>[] = [{}, { [FAVOURITES_KEY]: "[]" }, { [FAVOURITES_KEY]: "broken" }, { [FAVOURITES_KEY]: JSON.stringify(["x".repeat(201)]) }];
    for (const local of stored) {
      const t = io({ local });
      expect(await mergeBrowserFavourites(t.io)).toBeNull();
      expect(t.fetch).not.toHaveBeenCalled();
    }
    const t = io();
    expect(await mergeBrowserFavourites({ ...t.io, local: blocked })).toBeNull();
    expect(await mergeBrowserFavourites({ ...t.io, local: null })).toBeNull();
    expect(t.fetch).not.toHaveBeenCalled();
  });

  test("a 200: one POST of the list, then the browser's list is cleared and the copy is the account's", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami","botox"]' }, answer: async () => json(200, { ok: true, favourites: ["botox", "lami", "e-kursus"] }) });
    expect(await mergeBrowserFavourites(t.io)).toEqual(["botox", "lami", "e-kursus"]);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = t.fetch.mock.calls[0];
    expect(url).toBe("/api/konto/lemmikud/merge");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(bodyOf(init)).toEqual({ slugs: ["lami", "botox"] });
    expect(t.local.map.has(FAVOURITES_KEY)).toBe(false);
    expect(copyOf(t)).toBe('["botox","lami","e-kursus"]');
    expect(t.emit.mock.calls).toEqual([[FAVOURITES_EVENT], [FAVOURITES_MERGED_EVENT]]);
    // once per browser: the list is gone, so the next account load sends nothing
    expect(await mergeBrowserFavourites(t.io)).toBeNull();
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });

  test("a 400 (the API will never take this list): it is dropped, so it is not sent again on every account load", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' }, answer: async () => json(400, { ok: false, error: "slugs" }) });
    expect(await mergeBrowserFavourites(t.io)).toBeNull();
    expect(t.local.map.has(FAVOURITES_KEY)).toBe(false);
    expect(copyOf(t)).toBeUndefined();
    await mergeBrowserFavourites(t.io);
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });

  test("a 401 (the session has ended): the copy goes with it, the browser's list stays for the next login", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]', [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, answer: async () => json(401, { ok: false, reason: "replaced" }) });
    expect(await mergeBrowserFavourites(t.io)).toBeNull();
    expect(t.local.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false);
    expect(t.local.map.get(FAVOURITES_KEY)).toBe('["lami"]');
  });

  test("a 200 that arrives after Logi välja: the browser's list is in the account now (cleared here), but no copy is written", async () => {
    let answer: (r: Response) => void = () => {};
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' }, answer: () => new Promise<Response>((r) => (answer = r)) });
    const merging = mergeBrowserFavourites(t.io);
    await vi.waitFor(() => expect(t.fetch).toHaveBeenCalledTimes(1));
    t.hint.signedIn = false; // logged out while the merge was on its way (logout forgot the copy)
    answer(json(200, { ok: true, favourites: ["lami"] }));
    expect(await merging).toEqual(["lami"]);
    expect(t.local.map.has(FAVOURITES_KEY)).toBe(false);
    expect(t.local.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false);
  });

  test.each([
    ["500", async () => json(500, { ok: false, error: "server" })],
    ["400 that is not the API's (a proxy's page)", async () => new Response("<html>Bad Request</html>", { status: 400 })],
    ["200 without a list", async () => json(200, { ok: true })],
    ["200 that is not JSON", async () => new Response("<html>", { status: 200 })],
    ["no answer", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("%s: the browser's list stays for the next account load, the copy is untouched", async (_name, answer) => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]', [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, answer });
    expect(await mergeBrowserFavourites(t.io)).toBeNull();
    expect(t.local.map.get(FAVOURITES_KEY)).toBe('["lami"]');
    expect(copyOf(t)).toBe('["botox"]');
    expect(t.emit).not.toHaveBeenCalled();
  });

  test("two account loads at once send one request", async () => {
    let answer: (r: Response) => void = () => {};
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' }, answer: () => new Promise<Response>((r) => (answer = r)) });
    const first = mergeBrowserFavourites(t.io);
    const second = mergeBrowserFavourites(t.io);
    await vi.waitFor(() => expect(t.fetch).toHaveBeenCalledTimes(1));
    answer(json(200, { ok: true, favourites: ["lami"] }));
    expect(await first).toEqual(["lami"]);
    expect(await second).toEqual(["lami"]);
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });

  test("more than 100 in the browser: the 100 hearted last are sent, and the whole list is cleared after the 200", async () => {
    const many = Array.from({ length: 120 }, (_, i) => `k${i}`);
    const t = io({ local: { [FAVOURITES_KEY]: JSON.stringify(many) } });
    await mergeBrowserFavourites(t.io);
    expect(bodyOf(t.fetch.mock.calls[0][1]).slugs).toEqual(many.slice(20));
    expect(t.local.map.has(FAVOURITES_KEY)).toBe(false);
  });
});

describe("afterAccountLoad: every account page's answer goes through it", () => {
  test("an answer with favourites (the dashboard, Lemmikud) refreshes the copy, then the merge runs", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' } });
    const seen: (string | undefined)[] = [];
    t.fetch.mockImplementation(async () => {
      seen.push(copyOf(t));
      return json(200, { ok: true, favourites: ["lami", "botox"] });
    });
    expect(await afterAccountLoad({ client: { email: "kati@example.test" }, favourites: ["botox"] }, t.io)).toEqual(["lami", "botox"]);
    expect(seen).toEqual(['["botox"]']); // written before the merge was sent
    expect(copyOf(t)).toBe('["lami","botox"]');
  });

  test("an answer without favourites (an e-course) leaves the copy alone, and still merges", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]', [ACCOUNT_FAVOURITES_KEY]: '["x"]' }, answer: async () => json(200, { ok: true, favourites: ["lami", "x"] }) });
    await afterAccountLoad({ course: { slug: "e" } }, t.io);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(copyOf(t)).toBe('["lami","x"]');
  });

  test("nothing to merge: no request, the copy refreshed", async () => {
    const t = io();
    expect(await afterAccountLoad({ favourites: ["a"] }, t.io)).toBeNull();
    expect(t.fetch).not.toHaveBeenCalled();
    expect(copyOf(t)).toBe('["a"]');
  });
});

describe("setAccountFavourite: the course page's ♡ while signed in", () => {
  test("shows the change at once, sends it, and keeps what the server answers", async () => {
    const t = io({ local: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' } });
    const during: (string | undefined)[] = [];
    t.fetch.mockImplementation(async () => {
      during.push(copyOf(t));
      return json(200, { ok: true, favourites: ["lami", "botox"] });
    });
    expect(await setAccountFavourite("lami", true, t.io)).toBe("saved");
    expect(during).toEqual(['["lami","botox"]']);
    const [url, init] = t.fetch.mock.calls[0];
    expect(url).toBe("/api/konto/lemmikud");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(bodyOf(init)).toEqual({ slug: "lami", on: true });
    expect(copyOf(t)).toBe('["lami","botox"]');
    expect(t.local.map.has(FAVOURITES_KEY)).toBe(false); // the browser's own list is not touched
  });

  test("taking a heart off, also without a copy yet", async () => {
    const t = io({ answer: async () => json(200, { ok: true, favourites: [] }) });
    expect(await setAccountFavourite("lami", false, t.io)).toBe("saved");
    expect(bodyOf(t.fetch.mock.calls[0][1])).toEqual({ slug: "lami", on: false });
    expect(copyOf(t)).toBe("[]");
  });

  test.each([
    ["500", async () => json(500, { ok: false, error: "server" })],
    ["404 (the course is not published)", async () => json(404, { ok: false, error: "slug" })],
    ["200 without a list", async () => json(200, { ok: true })],
    ["no answer", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("%s: put back to what it was — a list, or no copy at all", async (_name, answer) => {
    const t = io({ local: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, answer });
    expect(await setAccountFavourite("lami", true, t.io)).toBe("failed");
    expect(copyOf(t)).toBe('["botox"]');
    expect(t.local.map.has(FAVOURITES_KEY)).toBe(false);

    const none = io({ answer });
    expect(await setAccountFavourite("lami", true, none.io)).toBe("failed");
    expect(none.local.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false); // absent again, not "[]"
  });

  test("401 (the session has ended): the press goes to this browser's own list, quietly, and the copy is forgotten", async () => {
    const on = io({ local: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]', [FAVOURITES_KEY]: '["x"]' }, answer: async () => json(401, { ok: false, reason: "replaced" }) });
    expect(await setAccountFavourite("lami", true, on.io)).toBe("browser");
    expect(on.local.map.get(FAVOURITES_KEY)).toBe('["x","lami"]');
    expect(on.local.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false);
    expect(on.emit).toHaveBeenLastCalledWith(FAVOURITES_EVENT);

    const off = io({ local: { [ACCOUNT_FAVOURITES_KEY]: '["lami"]', [FAVOURITES_KEY]: '["lami","x"]' }, answer: async () => json(401, { ok: false, reason: "none" }) });
    expect(await setAccountFavourite("lami", false, off.io)).toBe("browser");
    expect(off.local.map.get(FAVOURITES_KEY)).toBe('["x"]');
  });

  /** A fetch whose answers wait until released here, one by one, in order. */
  function held() {
    const waiting: { body: { slug: string; on: boolean }; answer: (r: Response) => void }[] = [];
    const answer = (_url: string, init?: RequestInit) => new Promise<Response>((resolve) => waiting.push({ body: bodyOf(init), answer: resolve }));
    return { waiting, answer };
  }

  test("presses before the answer: one request at a time; then the state the button shows now is sent, so the server ends there", async () => {
    const h = held();
    const t = io({ answer: h.answer });
    const first = setAccountFavourite("lami", true, t.io);
    const second = setAccountFavourite("lami", false, t.io);
    expect(copyOf(t)).toBe("[]"); // the button shows the last press at once
    await vi.waitFor(() => expect(h.waiting).toHaveLength(1));
    expect(h.waiting[0].body).toEqual({ slug: "lami", on: true });
    h.waiting[0].answer(json(200, { ok: true, favourites: ["lami"] }));
    await vi.waitFor(() => expect(h.waiting).toHaveLength(2)); // only after the first answer
    expect(h.waiting[1].body).toEqual({ slug: "lami", on: false });
    expect(copyOf(t)).toBe("[]"); // the first answer did not undo the second press
    h.waiting[1].answer(json(200, { ok: true, favourites: [] }));
    expect(await first).toBe("saved");
    expect(await second).toBe("saved");
    expect(copyOf(t)).toBe("[]");
    expect(t.fetch).toHaveBeenCalledTimes(2);
  });

  test("on, off, on before the answer: the server already has what the button shows, so nothing more is sent", async () => {
    const h = held();
    const t = io({ answer: h.answer });
    const presses = [setAccountFavourite("lami", true, t.io), setAccountFavourite("lami", false, t.io), setAccountFavourite("lami", true, t.io)];
    await vi.waitFor(() => expect(h.waiting).toHaveLength(1));
    h.waiting[0].answer(json(200, { ok: true, favourites: ["lami"] }));
    expect(await Promise.all(presses)).toEqual(["saved", "saved", "saved"]);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(copyOf(t)).toBe('["lami"]');
    // and a new press afterwards starts a new request
    const again = setAccountFavourite("lami", false, t.io);
    await vi.waitFor(() => expect(h.waiting).toHaveLength(2));
    h.waiting[1].answer(json(200, { ok: true, favourites: [] }));
    expect(await again).toBe("saved");
  });

  test("the second request fails: the copy shows what the server has (the first answer), and every press of the run says it failed", async () => {
    const h = held();
    const t = io({ local: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, answer: h.answer });
    const first = setAccountFavourite("lami", true, t.io);
    const second = setAccountFavourite("lami", false, t.io);
    await vi.waitFor(() => expect(h.waiting).toHaveLength(1));
    h.waiting[0].answer(json(200, { ok: true, favourites: ["lami", "botox"] }));
    await vi.waitFor(() => expect(h.waiting).toHaveLength(2));
    h.waiting[1].answer(json(500, { ok: false, error: "server" }));
    expect(await second).toBe("failed");
    expect(await first).toBe("failed");
    expect(copyOf(t)).toBe('["lami","botox"]');
  });

  test("an answer that arrives after Logi välja writes no copy: neither the server's list nor a put-back", async () => {
    for (const status of [200, 500]) {
      const h = held();
      const t = io({ local: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, answer: h.answer });
      const press = setAccountFavourite("lami", true, t.io);
      await vi.waitFor(() => expect(h.waiting).toHaveLength(1));
      // Logi välja meanwhile: the copy is forgotten and the hint cookie is gone
      forgetAccountFavourites(t.io);
      t.hint.signedIn = false;
      h.waiting[0].answer(status === 200 ? json(200, { ok: true, favourites: ["lami", "botox"] }) : json(500, { ok: false }));
      expect(await press).toBe(status === 200 ? "saved" : "failed");
      expect(t.local.map.has(ACCOUNT_FAVOURITES_KEY), String(status)).toBe(false);
    }
  });

  test("courses are independent: a press on another course is not held back", async () => {
    const h = held();
    const t = io({ answer: h.answer });
    void setAccountFavourite("lami", true, t.io);
    void setAccountFavourite("botox", true, t.io);
    await vi.waitFor(() => expect(h.waiting.map((w) => w.body.slug)).toEqual(["lami", "botox"]));
    for (const w of h.waiting) w.answer(json(200, { ok: true, favourites: [w.body.slug] }));
  });
});
