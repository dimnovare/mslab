import { AsyncLocalStorage } from "node:async_hooks";
import { REQUEST_SCOPE_KEY, type RequestScope } from "../server/request-scope";

// The other half of server/request-scope.ts: the Worker entry runs each request in a scope of its own, which began at a
// given time and memoises nothing yet.

const g = globalThis as typeof globalThis & { [REQUEST_SCOPE_KEY]?: AsyncLocalStorage<RequestScope> };

/** Runs `fn` as a request that began at `startedAt` (the Worker entry: Date.now() before any I/O). */
export function runAsRequest<T>(startedAt: number, fn: () => T): T {
  const storage = (g[REQUEST_SCOPE_KEY] ??= new AsyncLocalStorage<RequestScope>());
  return storage.run({ startedAt, memo: new Map() }, fn);
}
