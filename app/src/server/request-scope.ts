// The Worker request the current code runs for. The Worker entry (worker.ts) runs every request inside an
// AsyncLocalStorage holding this scope (worker/request-context.ts): when the request began (server/request-start.ts)
// and what is memoised for it (server/per-request.ts: its database client, its signed-in admin, the rows its page reads).
//
// The storage lives on globalThis under this key: the entry and OpenNext's server are separate bundles, and this module
// is also compiled into OpenNext's configuration bundle (through server/page-store.ts), which cannot import
// node:async_hooks. `next dev` and the unit tests outside runAsRequest have no scope (null).

export const REQUEST_SCOPE_KEY = Symbol.for("mslab.request-scope");

export type RequestScope = {
  /** When the request began: Date.now() in the Worker entry, before any I/O. */
  startedAt: number;
  /** Values memoised for this request, one slot per memoised function (server/per-request.ts). */
  memo: Map<symbol, Map<string, unknown>>;
};

type Storage = { getStore(): RequestScope | undefined };

/** The current Worker request's scope, or null outside one. */
export function requestScope(): RequestScope | null {
  const storage = (globalThis as typeof globalThis & { [REQUEST_SCOPE_KEY]?: Storage })[REQUEST_SCOPE_KEY];
  return storage?.getStore() ?? null;
}
