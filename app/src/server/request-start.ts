// When the request that is rendering a page began. A cached page is dated by it, not by when it was stored: a render
// that read the database just before an admin's save and stored its page just after it must count as older than the
// save, or the save's revalidation would pass it by (server/page-store.ts).
//
// The Worker entry (worker.ts) runs every request inside an AsyncLocalStorage holding its start (worker/request-context.ts).
// The storage lives on globalThis under this key: the entry and OpenNext's server are separate bundles, and this module
// is also compiled into OpenNext's configuration bundle, which cannot import node:async_hooks.

export const REQUEST_START_KEY = Symbol.for("mslab.request-start");

type Store = { getStore(): { startedAt: number } | undefined };

/** When the current request began, or null outside one (then the caller uses the time it has). */
export function requestStartedAt(): number | null {
  const storage = (globalThis as typeof globalThis & { [REQUEST_START_KEY]?: Store })[REQUEST_START_KEY];
  return storage?.getStore()?.startedAt ?? null;
}
