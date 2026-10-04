// Favourite courses (P6, S3). A visitor's hearts are kept in this browser (localStorage "mslab-fav", an array of slugs).
// Once there is an account they live in the account:
// - The browser's list is merged into the account once: after the first account page of this browser has loaded
//   (afterAccountLoad, which every account page goes through: components/account/useAccount.ts), POST
//   /api/konto/lemmikud/merge; the browser's list is cleared only after a 200, so a failure tries again on the next load.
// - While signed in, the course page's ♡ (components/site/FavouriteButton.tsx) shows and changes the account's list. The
//   page is a cached public page that must not ask the server for anything when it loads, so it reads the account's list
//   as this tab last heard it: sessionStorage "mslab-account-fav", written by every account answer that carries the list
//   (the dashboard, Lemmikud, a merge, a ♡). A ♡ shows its change at once and sends it (POST /api/konto/lemmikud); a
//   failure puts it back, and when the session has ended (401) the click goes to this browser's own list, quietly.
// Storage and fetch come in as `io` (browserIo() in the browser), so the tests can run them without one.

export const FAVOURITES_KEY = "mslab-fav";
/** sessionStorage key: the account's favourites as this tab last heard them (newest first). */
export const ACCOUNT_FAVOURITES_KEY = "mslab-account-fav";
/** Fired on window after a change in this tab (the "storage" event only reaches other tabs). */
export const FAVOURITES_EVENT = "mslab-fav-change";
/** Fired on window after this browser's favourites were merged into the account (an open Lemmikud list loads again). */
export const FAVOURITES_MERGED_EVENT = "mslab-fav-merged";
/** The most slugs a merge sends (the API's limit, server/account-input.ts). */
export const MERGE_LIMIT = 100;

/** Course slugs from the stored JSON; anything malformed counts as an empty list. */
export function parseFavourites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? strings(v) : [];
  } catch {
    return [];
  }
}

/** The strings of a list, each once, in order (empty ones and anything else left out). */
const strings = (list: unknown[]): string[] => [...new Set(list.filter((x): x is string => typeof x === "string" && x.length > 0))];

/** The list with `slug` added (at the end) or removed. */
export function toggleFavourite(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

/** The list with `slug` in it, first (the account lists the newest first), or without it. */
export function withFavourite(list: string[], slug: string, on: boolean): string[] {
  const rest = list.filter((s) => s !== slug);
  return on ? [slug, ...rest] : rest;
}

/** The account's list as this tab keeps it: null when there is no copy (none written in this tab, or not a list). */
export function parseAccountFavourites(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? strings(v) : null;
  } catch {
    return null;
  }
}

/** What a merge sends: the browser's list, at most the 100 hearted last (the list grows at its end); null when there is nothing to send. */
export function mergeSlugs(raw: string | null | undefined): string[] | null {
  const list = parseFavourites(raw);
  return list.length ? list.slice(-MERGE_LIMIT) : null;
}

/** The favourites of an account answer (`{ favourites: [...] }`): its strings, or null when it carries no list. */
export function answerFavourites(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const list = (body as { favourites?: unknown }).favourites;
  return Array.isArray(list) ? strings(list) : null;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** What the account side of the favourites uses: the two storages (null when blocked), fetch, and a way to tell the page. */
export type FavouriteIo = { local: StorageLike | null; session: StorageLike | null; fetch: typeof fetch; emit(event: string): void };

/** A storage of this window, or null when the browser refuses it (private mode, blocked site data: even reading the property can throw). */
function windowStorage(name: "localStorage" | "sessionStorage"): StorageLike | null {
  try {
    return window[name];
  } catch {
    return null;
  }
}

/** The browser's own: localStorage, sessionStorage, fetch, window events. */
export function browserIo(): FavouriteIo {
  return {
    local: windowStorage("localStorage"),
    session: windowStorage("sessionStorage"),
    fetch: (input, init) => fetch(input, init),
    emit: (event) => window.dispatchEvent(new Event(event)),
  };
}

const get = (store: StorageLike | null, key: string): string | null => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/** Writes (or, with null, removes) one key; false when the storage refused it. */
const put = (store: StorageLike | null, key: string, value: string | null): boolean => {
  if (!store) return false;
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

/** The account's favourites as this tab last heard them, or null (none heard in this tab yet, or storage blocked). */
export const readAccountFavourites = (io: FavouriteIo = browserIo()): string[] | null => parseAccountFavourites(get(io.session, ACCOUNT_FAVOURITES_KEY));

/** Keeps the account's list in this tab and tells the page's ♡ buttons. */
export function rememberAccountFavourites(list: string[], io: FavouriteIo = browserIo()): void {
  put(io.session, ACCOUNT_FAVOURITES_KEY, JSON.stringify(list));
  io.emit(FAVOURITES_EVENT);
}

/** Forgets this tab's copy (logging out, account deletion, a session that has ended). */
export function forgetAccountFavourites(io: FavouriteIo = browserIo()): void {
  put(io.session, ACCOUNT_FAVOURITES_KEY, null);
  io.emit(FAVOURITES_EVENT);
}

const postJson = (io: FavouriteIo, url: string, body: unknown) =>
  io.fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

/** The list of a 200 `{ ok: true, favourites }`, or null for any other answer. */
async function savedList(res: Response): Promise<string[] | null> {
  if (res.status !== 200) return null;
  const body: unknown = await res.json().catch(() => null);
  return (body as { ok?: unknown } | null)?.ok === true ? answerFavourites(body) : null;
}

async function runMerge(io: FavouriteIo): Promise<string[] | null> {
  const slugs = mergeSlugs(get(io.local, FAVOURITES_KEY));
  if (!slugs) return null;
  let merged: string[] | null;
  try {
    merged = await savedList(await postJson(io, "/api/konto/lemmikud/merge", { slugs }));
  } catch {
    return null; // no answer: the list stays for the next account load
  }
  if (!merged) return null;
  put(io.local, FAVOURITES_KEY, null);
  rememberAccountFavourites(merged, io);
  io.emit(FAVOURITES_MERGED_EVENT);
  return merged;
}

let merging: Promise<string[] | null> | null = null;

/**
 * Sends this browser's favourites to the account (POST /api/konto/lemmikud/merge, the 100 hearted last). After a 200 the browser's
 * list is cleared, so this happens once per browser; after anything else it stays and the next account load tries again. One at a time
 * in this page (a second call joins the first). Answers the account's list after the merge, or null (nothing sent, or it failed).
 */
export function mergeBrowserFavourites(io: FavouriteIo = browserIo()): Promise<string[] | null> {
  merging ??= runMerge(io).finally(() => {
    merging = null;
  });
  return merging;
}

/**
 * What every account page does with a 200 (components/account/useAccount.ts): an answer that lists the account's favourites (the
 * dashboard, Lemmikud) refreshes this tab's copy, then the browser's own favourites are merged (once per browser).
 */
export function afterAccountLoad(answer: unknown, io: FavouriteIo = browserIo()): Promise<string[] | null> {
  const listed = answerFavourites(answer);
  if (listed) rememberAccountFavourites(listed, io);
  return mergeBrowserFavourites(io);
}

/** The last ♡ click in this page: an answer to an older one must not undo a newer one. */
let latestClick = 0;

/**
 * The course page's ♡ while signed in: shows `on` at once in this tab's copy, then POST /api/konto/lemmikud `{ slug, on }`.
 * - "saved": the server's list is kept;
 * - "browser": the session has ended (401, whose answer also cleared the hint cookie): the copy is forgotten and the click goes to this
 *   browser's own list instead, with no message (the caller tells the header that the sign-in state changed);
 * - "failed": anything else, or no answer: the copy is put back as it was.
 * A newer click before the answer decides: the older answer changes nothing.
 */
export async function setAccountFavourite(slug: string, on: boolean, io: FavouriteIo = browserIo()): Promise<"saved" | "browser" | "failed"> {
  const click = ++latestClick;
  const before = readAccountFavourites(io) ?? [];
  rememberAccountFavourites(withFavourite(before, slug, on), io);
  let res: Response;
  let list: string[] | null = null;
  try {
    res = await postJson(io, "/api/konto/lemmikud", { slug, on });
    if (res.status !== 401) list = await savedList(res);
  } catch {
    if (click === latestClick) rememberAccountFavourites(before, io);
    return "failed";
  }
  if (res.status === 401) {
    const own = parseFavourites(get(io.local, FAVOURITES_KEY));
    put(io.local, FAVOURITES_KEY, JSON.stringify(own.includes(slug) === on ? own : toggleFavourite(own, slug)));
    forgetAccountFavourites(io);
    return "browser";
  }
  if (click === latestClick) rememberAccountFavourites(list ?? before, io);
  return list ? "saved" : "failed";
}
