import { requestScope } from "./request-scope";

// When the request that is rendering a page began. A cached page is dated by it, not by when it was stored: a render
// that read the database just before an admin's save and stored its page just after it must count as older than the
// save, or the save's revalidation would pass it by (server/page-store.ts).
//
// The Worker entry (worker.ts) runs every request inside a scope holding its start (server/request-scope.ts).

/** When the current request began, or null outside one (then the caller uses the time it has). */
export function requestStartedAt(): number | null {
  return requestScope()?.startedAt ?? null;
}
