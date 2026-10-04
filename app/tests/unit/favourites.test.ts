import { describe, expect, test, vi } from "vitest";
import {
  ACCOUNT_FAVOURITES_KEY, FAVOURITES_EVENT, FAVOURITES_KEY, FAVOURITES_MERGED_EVENT, MERGE_LIMIT, afterAccountLoad, answerFavourites, forgetAccountFavourites, mergeBrowserFavourites,
  mergeSlugs, parseAccountFavourites, readAccountFavourites, rememberAccountFavourites, setAccountFavourite, withFavourite, type FavouriteIo, type StorageLike,
} from "@/lib/favourites";

// The favourites in the browser (lib/favourites.ts) once there is an account: the browser's own list (localStorage "mslab-fav")
// is merged into the account once, after the first account page has loaded, and cleared only when the server said 200; the
// account's list is kept in this tab (sessionStorage "mslab-account-fav") for the course page's ♡, which writes the account
// (optimistic, rolled back on a failure, the browser's list again when the session has ended). Storage and fetch are fakes here.

/** A Storage stand-in (a Map), or one that throws on every use (blocked storage). */
function memory(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}
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

function io(opts: { local?: Record<string, string>; session?: Record<string, string>; answer?: (url: string, init?: RequestInit) => Promise<Response> } = {}) {
  const local = memory(opts.local);
  const session = memory(opts.session);
  const fetch = vi.fn(opts.answer ?? (async () => json(200, { ok: true, favourites: [] })));
  const emit = vi.fn();
  const value: FavouriteIo = { local, session, fetch: fetch as unknown as typeof globalThis.fetch, emit };
  return { io: value, local, session, fetch, emit };
}

const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));

describe("the lists", () => {
  test("the account's copy: null when this tab has none (or it is not a list), else its strings", () => {
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

  test("the tab's copy is written and forgotten with an event, and blocked storage is no copy", () => {
    const t = io();
    expect(readAccountFavourites(t.io)).toBeNull();
    rememberAccountFavourites(["a"], t.io);
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["a"]');
    expect(readAccountFavourites(t.io)).toEqual(["a"]);
    forgetAccountFavourites(t.io);
    expect(t.session.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false);
    expect(t.emit).toHaveBeenCalledTimes(2);
    expect(t.emit).toHaveBeenCalledWith(FAVOURITES_EVENT);
    const none: FavouriteIo = { ...t.io, session: blocked };
    expect(readAccountFavourites(none)).toBeNull();
    expect(() => rememberAccountFavourites(["a"], none)).not.toThrow();
    expect(readAccountFavourites({ ...t.io, session: null })).toBeNull();
  });
});

describe("mergeBrowserFavourites: once, after the first account load", () => {
  test("nothing in this browser: no request", async () => {
    const stored: Record<string, string>[] = [{}, { [FAVOURITES_KEY]: "[]" }, { [FAVOURITES_KEY]: "broken" }];
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

  test("a 200: one POST of the list, then the browser's list is cleared and the tab's copy is the account's", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami","botox"]' }, answer: async () => json(200, { ok: true, favourites: ["botox", "lami", "e-kursus"] }) });
    expect(await mergeBrowserFavourites(t.io)).toEqual(["botox", "lami", "e-kursus"]);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = t.fetch.mock.calls[0];
    expect(url).toBe("/api/konto/lemmikud/merge");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(bodyOf(init)).toEqual({ slugs: ["lami", "botox"] });
    expect(t.local.map.has(FAVOURITES_KEY)).toBe(false);
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["botox","lami","e-kursus"]');
    expect(t.emit.mock.calls).toEqual([[FAVOURITES_EVENT], [FAVOURITES_MERGED_EVENT]]);
    // once per browser: the list is gone, so the next account load sends nothing
    expect(await mergeBrowserFavourites(t.io)).toBeNull();
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["401 (signed out meanwhile)", async () => json(401, { ok: false, reason: "none" })],
    ["500", async () => json(500, { ok: false, error: "server" })],
    ["400", async () => json(400, { ok: false, error: "slugs" })],
    ["200 without a list", async () => json(200, { ok: true })],
    ["200 that is not JSON", async () => new Response("<html>", { status: 200 })],
    ["no answer", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("%s: the browser's list stays for the next account load, the tab's copy is untouched", async (_name, answer) => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' }, session: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, answer });
    expect(await mergeBrowserFavourites(t.io)).toBeNull();
    expect(t.local.map.get(FAVOURITES_KEY)).toBe('["lami"]');
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["botox"]');
    expect(t.emit).not.toHaveBeenCalled();
  });

  test("two account loads at once send one request", async () => {
    let answer: (r: Response) => void = () => {};
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' }, answer: () => new Promise<Response>((r) => (answer = r)) });
    const first = mergeBrowserFavourites(t.io);
    const second = mergeBrowserFavourites(t.io);
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
  test("an answer with favourites (the dashboard, Lemmikud) refreshes the tab's copy, then the merge runs", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' }, answer: async () => json(200, { ok: true, favourites: ["lami", "botox"] }) });
    const seen: (string | undefined)[] = [];
    t.fetch.mockImplementation(async () => {
      seen.push(t.session.map.get(ACCOUNT_FAVOURITES_KEY));
      return json(200, { ok: true, favourites: ["lami", "botox"] });
    });
    expect(await afterAccountLoad({ client: { email: "kati@example.test" }, favourites: ["botox"] }, t.io)).toEqual(["lami", "botox"]);
    expect(seen).toEqual(['["botox"]']); // written before the merge was sent
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["lami","botox"]');
  });

  test("an answer without favourites (an e-course) leaves the copy alone, and still merges", async () => {
    const t = io({ local: { [FAVOURITES_KEY]: '["lami"]' }, session: { [ACCOUNT_FAVOURITES_KEY]: '["x"]' }, answer: async () => json(200, { ok: true, favourites: ["lami", "x"] }) });
    await afterAccountLoad({ course: { slug: "e" } }, t.io);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["lami","x"]');
  });

  test("nothing to merge: no request, the copy refreshed", async () => {
    const t = io();
    expect(await afterAccountLoad({ favourites: ["a"] }, t.io)).toBeNull();
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["a"]');
  });
});

describe("setAccountFavourite: the course page's ♡ while signed in", () => {
  test("shows the change at once, sends it, and keeps what the server answers", async () => {
    const t = io({ session: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' } });
    const during: (string | undefined)[] = [];
    t.fetch.mockImplementation(async () => {
      during.push(t.session.map.get(ACCOUNT_FAVOURITES_KEY));
      return json(200, { ok: true, favourites: ["lami", "botox"] });
    });
    expect(await setAccountFavourite("lami", true, t.io)).toBe("saved");
    expect(during).toEqual(['["lami","botox"]']);
    const [url, init] = t.fetch.mock.calls[0];
    expect(url).toBe("/api/konto/lemmikud");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(bodyOf(init)).toEqual({ slug: "lami", on: true });
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["lami","botox"]');
    expect(t.local.map.size).toBe(0); // the browser's own list is not touched
  });

  test("taking a heart off, also without a copy in this tab", async () => {
    const t = io({ answer: async () => json(200, { ok: true, favourites: [] }) });
    expect(await setAccountFavourite("lami", false, t.io)).toBe("saved");
    expect(bodyOf(t.fetch.mock.calls[0][1])).toEqual({ slug: "lami", on: false });
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe("[]");
  });

  test.each([
    ["500", async () => json(500, { ok: false, error: "server" })],
    ["404 (the course is not published)", async () => json(404, { ok: false, error: "slug" })],
    ["200 without a list", async () => json(200, { ok: true })],
    ["no answer", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("%s: rolled back to what it was", async (_name, answer) => {
    const t = io({ session: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, answer });
    expect(await setAccountFavourite("lami", true, t.io)).toBe("failed");
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["botox"]');
    expect(t.local.map.size).toBe(0);
  });

  test("401 (the session has ended): the click goes to this browser's own list, quietly, and the tab's copy is forgotten", async () => {
    const on = io({ session: { [ACCOUNT_FAVOURITES_KEY]: '["botox"]' }, local: { [FAVOURITES_KEY]: '["x"]' }, answer: async () => json(401, { ok: false, reason: "replaced" }) });
    expect(await setAccountFavourite("lami", true, on.io)).toBe("browser");
    expect(on.local.map.get(FAVOURITES_KEY)).toBe('["x","lami"]');
    expect(on.session.map.has(ACCOUNT_FAVOURITES_KEY)).toBe(false);
    expect(on.emit).toHaveBeenLastCalledWith(FAVOURITES_EVENT);

    const off = io({ session: { [ACCOUNT_FAVOURITES_KEY]: '["lami"]' }, local: { [FAVOURITES_KEY]: '["lami","x"]' }, answer: async () => json(401, { ok: false, reason: "none" }) });
    expect(await setAccountFavourite("lami", false, off.io)).toBe("browser");
    expect(off.local.map.get(FAVOURITES_KEY)).toBe('["x"]');
  });

  test("a second click before the first answer: the older answer does not undo the newer click", async () => {
    const answers: ((r: Response) => void)[] = [];
    const t = io({ answer: () => new Promise<Response>((r) => answers.push(r)) });
    const first = setAccountFavourite("lami", true, t.io);
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe('["lami"]');
    const second = setAccountFavourite("lami", false, t.io);
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe("[]");
    answers[0](json(200, { ok: true, favourites: ["lami"] })); // the first click's answer arrives late
    await first;
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe("[]");
    answers[1](json(200, { ok: true, favourites: [] }));
    expect(await second).toBe("saved");
    expect(t.session.map.get(ACCOUNT_FAVOURITES_KEY)).toBe("[]");
  });
});
