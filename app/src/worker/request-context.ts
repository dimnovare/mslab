import { AsyncLocalStorage } from "node:async_hooks";
import { REQUEST_START_KEY } from "../server/request-start";

// The other half of server/request-start.ts: the Worker entry runs each request as one that began at a given time.

type RequestStart = { startedAt: number };
const g = globalThis as typeof globalThis & { [REQUEST_START_KEY]?: AsyncLocalStorage<RequestStart> };

/** Runs `fn` as a request that began at `startedAt` (the Worker entry: Date.now() before any I/O). */
export function runAsRequest<T>(startedAt: number, fn: () => T): T {
  const storage = (g[REQUEST_START_KEY] ??= new AsyncLocalStorage<RequestStart>());
  return storage.run({ startedAt }, fn);
}
