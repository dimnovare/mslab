// React's cache() as it behaves in a Worker isolate after a request was killed for running over the CPU limit
// (Workers Free: 10 ms) in the middle of a render.
//
// React finds "the current request" through a module variable that its renderer sets when it starts rendering and
// restores in a `finally`. The runtime stops a request that runs over the limit wherever it is, and a `finally` of the
// stopped code never runs; the isolate goes on serving requests. From then on every lookup made after an `await` (that
// is, outside React's own rendering loop) resolves to the dead request, so cache() hands every later request in that
// isolate the values it memoised there: a database client another request has already closed (postgres.js
// CONNECTION_ENDED, seen on the live Worker 02.10.2026), another visitor's admin session, an older page's data.
//
// This fake is that state: one memo shared by every caller, per function and arguments. Use it with
// `vi.mock("react", async (original) => (await import("../lost-react-request")).lostReactRequest(original))`.

export async function lostReactRequest(importOriginal: () => Promise<unknown>) {
  const react = (await importOriginal()) as typeof import("react");
  const cache = <F extends (...args: never[]) => unknown>(fn: F): F => {
    const memo = new Map<string, unknown>();
    return ((...args: never[]) => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key);
    }) as F;
  };
  return { ...react, default: { ...react, cache }, cache };
}
