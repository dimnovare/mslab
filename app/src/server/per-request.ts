import { cache } from "react";
import { requestScope } from "./request-scope";

/** Arguments a memoised function may take: they make up the memo's key. */
type Key = string | number;

/**
 * Memoises `fn` per Worker request and per arguments: the first call in a request runs it, later calls in the same
 * request get the same value (a promise included). The server code uses this, not React's cache().
 *
 * Why not cache(): React finds "the current request" through a module variable that its renderer sets when it starts
 * rendering and restores in a `finally`. Workers Free stops a request that runs over the CPU limit (10 ms) wherever it
 * is, a `finally` of the stopped code never runs, and the isolate goes on serving requests. From then on every lookup
 * made after an `await` resolves to the dead request, and cache() hands every later request in that isolate what it
 * memoised there. Seen on the live Worker (02.10.2026): admin requests got the database client of another request,
 * which that request had already closed (postgres.js CONNECTION_ENDED, a 500 on every admin page served by that
 * isolate). The Worker request scope (worker.ts → worker/request-context.ts) is an AsyncLocalStorage, which the
 * runtime keeps per request also then.
 *
 * Outside a Worker request (`next dev`, tests) there is no scope, and it is React's cache() as before.
 */
export function perRequest<A extends Key[], R>(fn: (...args: A) => R): (...args: A) => R {
  const outside = cache(fn);
  const slot = Symbol(fn.name || "perRequest");
  return (...args: A): R => {
    const scope = requestScope();
    if (!scope) return outside(...args);
    let values = scope.memo.get(slot);
    if (!values) scope.memo.set(slot, (values = new Map()));
    const key = JSON.stringify(args);
    if (!values.has(key)) values.set(key, fn(...args));
    return values.get(key) as R;
  };
}
