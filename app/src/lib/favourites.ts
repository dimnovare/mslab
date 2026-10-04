import { isDone, sendJson, type JsonAnswer } from "./json-request";
import { storable } from "./storable";

// Favourite courses (P6, S3). A visitor's hearts are kept in this browser (localStorage "mslab-fav", an array of slugs).
// Once there is an account they live in the account:
// - The browser's list is merged into the account once: after the first account page of this browser has loaded
//   (afterAccountLoad, which every account page goes through: components/account/useAccount.ts), POST
//   /api/konto/lemmikud/merge; the browser's list is cleared only after a 200 (or dropped after a 400: the API will never take
//   it), so any other failure tries again on the next load.
// - While signed in, the course page's ♡ (components/site/FavouriteButton.tsx) shows and changes the account's list. The
//   page is a cached public page that must not ask the server for anything when it loads, so it reads the account's list as
//   this browser last heard it: localStorage "mslab-account-fav", written by every account answer that carries the list (the
//   dashboard, Lemmikud, a merge, a ♡), so a new tab or a visit days later shows the hearts too (and the "storage" event keeps
//   other tabs in step). It is forgotten on logout, on any 401, on account deletion and on every login, so the previous
//   person's hearts never show on a shared device. A ♡ shows its change at once and sends it (POST /api/konto/lemmikud), one
//   request per course at a time; a failure puts back what the server has, and when the session has ended (401) the press
//   goes to this browser's own list, quietly.
// Storage and fetch come in as `io` (browserIo() in the browser), so the tests can run them without one.

export const FAVOURITES_KEY = "mslab-fav";
/** localStorage key: the account's favourites as this browser last heard them (newest first). */
export const ACCOUNT_FAVOURITES_KEY = "mslab-account-fav";
/** Fired on window after a change in this tab (the "storage" event only reaches other tabs). */
export const FAVOURITES_EVENT = "mslab-fav-change";
/** Fired on window after this browser's favourites were merged into the account (an open Lemmikud list loads again). */
export const FAVOURITES_MERGED_EVENT = "mslab-fav-merged";
/** The most slugs a merge sends, and the longest slug (the API's limits, server/account-input.ts LIMITS). */
export const MERGE_LIMIT = 100;
export const SLUG_LIMIT = 200;

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

/** The account's list as this browser keeps it: null when there is no copy (none written since the last login, or not a list). */
export function parseAccountFavourites(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? strings(v) : null;
  } catch {
    return null;
  }
}

/**
 * What a merge sends: the browser's slugs the API can take (at most 200 characters, text Postgres can store), at most the 100
 * hearted last (the list grows at its end); null when there is nothing to send.
 */
export function mergeSlugs(raw: string | null | undefined): string[] | null {
  const list = parseFavourites(raw).filter((slug) => slug.length <= SLUG_LIMIT && storable(slug));
  return list.length ? list.slice(-MERGE_LIMIT) : null;
}

/** The favourites of an account answer (`{ favourites: [...] }`): its strings, or null when it carries no list. */
export function answerFavourites(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const list = (body as { favourites?: unknown }).favourites;
  return Array.isArray(list) ? strings(list) : null;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** What the account side of the favourites uses: this browser's storage (null when blocked), fetch, and a way to tell the page. */
export type FavouriteIo = { local: StorageLike | null; fetch: typeof fetch; emit(event: string): void };

/** localStorage, or null when the browser refuses it (private mode, blocked site data: even reading the property can throw). */
function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The browser's own: localStorage, fetch, window events. */
export function browserIo(): FavouriteIo {
  return { local: browserStorage(), fetch: (input, init) => fetch(input, init), emit: (event) => window.dispatchEvent(new Event(event)) };
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

/** The account's favourites as this browser last heard them, or null (none heard since the last login, or storage blocked). */
export const readAccountFavourites = (io: FavouriteIo = browserIo()): string[] | null => parseAccountFavourites(get(io.local, ACCOUNT_FAVOURITES_KEY));

/** Keeps the account's list in this browser and tells the page's ♡ buttons (other tabs hear it through the "storage" event). */
export function rememberAccountFavourites(list: string[], io: FavouriteIo = browserIo()): void {
  put(io.local, ACCOUNT_FAVOURITES_KEY, JSON.stringify(list));
  io.emit(FAVOURITES_EVENT);
}

/** Forgets the copy (logging out or in, account deletion, a session that has ended): the key is gone, not an empty list. */
export function forgetAccountFavourites(io: FavouriteIo = browserIo()): void {
  put(io.local, ACCOUNT_FAVOURITES_KEY, null);
  io.emit(FAVOURITES_EVENT);
}

/** Puts the copy back as it was: a list, or no copy at all. */
const restoreCopy = (list: string[] | null, io: FavouriteIo) => (list ? rememberAccountFavourites(list, io) : forgetAccountFavourites(io));

/** The account's list in an answer of the favourites endpoints (POST /api/konto/lemmikud, …/merge): a 2xx `{ ok: true, favourites }`, else null. */
export const savedList = (answer: JsonAnswer): string[] | null => (isDone(answer) ? answerFavourites(answer.data) : null);

async function runMerge(io: FavouriteIo): Promise<string[] | null> {
  const slugs = mergeSlugs(get(io.local, FAVOURITES_KEY));
  if (!slugs) return null;
  const answer = await sendJson("/api/konto/lemmikud/merge", { slugs }, { fetch: io.fetch });
  if (answer.status === 400 && answer.data.ok === false) {
    // the API refuses this list and always will: dropped, so it is not sent again on every account load
    put(io.local, FAVOURITES_KEY, null);
    io.emit(FAVOURITES_EVENT);
    return null;
  }
  const merged = savedList(answer);
  if (!merged) return null; // no answer, signed out, a server failure: the list stays for the next account load
  put(io.local, FAVOURITES_KEY, null);
  rememberAccountFavourites(merged, io);
  io.emit(FAVOURITES_MERGED_EVENT);
  return merged;
}

let merging: Promise<string[] | null> | null = null;

/**
 * Sends this browser's favourites to the account (POST /api/konto/lemmikud/merge). After a 200 the browser's list is cleared, so this
 * happens once per browser; after a 400 it is dropped; after anything else it stays and the next account load tries again. One at a
 * time in this page (a second call joins the first). Answers the account's list after the merge, or null (nothing merged).
 */
export function mergeBrowserFavourites(io: FavouriteIo = browserIo()): Promise<string[] | null> {
  merging ??= runMerge(io).finally(() => {
    merging = null;
  });
  return merging;
}

/**
 * What every account page does with a 200 (components/account/useAccount.ts): an answer that lists the account's favourites (the
 * dashboard, Lemmikud) refreshes this browser's copy, then the browser's own favourites are merged (once per browser).
 */
export function afterAccountLoad(answer: unknown, io: FavouriteIo = browserIo()): Promise<string[] | null> {
  const listed = answerFavourites(answer);
  if (listed) rememberAccountFavourites(listed, io);
  return mergeBrowserFavourites(io);
}

export type PressResult = "saved" | "browser" | "failed";

/** The ♡ presses of a course on their way: the state last asked for, and the end of the run that sends it. */
type Presses = { wanted: boolean; done: Promise<PressResult> };
const pressing = new Map<string, Presses>();

/**
 * The course page's ♡ while signed in: shows `on` at once in the copy, then POST /api/konto/lemmikud `{ slug, on }`, one request
 * per course at a time. A press while one is on its way only changes what is wanted; when the request has been answered and the
 * button now wants the other state, that is sent next, so the server always ends where the button is. Every press of the run
 * answers how it ended:
 * - "saved": the server's list is the copy;
 * - "browser": the session has ended (401, whose answer also cleared the hint cookie): the copy is forgotten and the press goes to this
 *   browser's own list instead (the caller tells the header that the sign-in state changed);
 * - "failed": anything else, or no answer: the copy is put back to what the server has (the copy before the first press, or no copy).
 */
export function setAccountFavourite(slug: string, on: boolean, io: FavouriteIo = browserIo()): Promise<PressResult> {
  const known = readAccountFavourites(io);
  rememberAccountFavourites(withFavourite(known ?? [], slug, on), io);
  const running = pressing.get(slug);
  if (running) {
    running.wanted = on;
    return running.done;
  }
  const presses: Presses = { wanted: on, done: Promise.resolve<PressResult>("saved") };
  pressing.set(slug, presses);
  presses.done = sendPresses(slug, presses, known, io);
  return presses.done;
}

async function sendPresses(slug: string, presses: Presses, known: string[] | null, io: FavouriteIo): Promise<PressResult> {
  let server = known; // the list as the server has it, as far as this browser knows (null: no copy)
  try {
    for (;;) {
      const sent = presses.wanted;
      const answer = await sendJson("/api/konto/lemmikud", { slug, on: sent }, { fetch: io.fetch });
      if (answer.status === 401) {
        const own = parseFavourites(get(io.local, FAVOURITES_KEY));
        put(io.local, FAVOURITES_KEY, JSON.stringify(own.includes(slug) === presses.wanted ? own : toggleFavourite(own, slug)));
        forgetAccountFavourites(io);
        return "browser";
      }
      const list = savedList(answer);
      if (!list) {
        restoreCopy(server, io);
        return "failed";
      }
      server = list;
      if (presses.wanted === sent) {
        rememberAccountFavourites(list, io);
        return "saved";
      }
      // pressed again meanwhile: the button now wants the other state, which is sent next (the copy already shows it)
    }
  } finally {
    pressing.delete(slug);
  }
}
