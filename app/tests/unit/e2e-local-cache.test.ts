import { describe, expect, test } from "vitest";
import { sameLocalWorker } from "../e2e/local-cache";

// The production-build e2e run checks that the local Worker takes this machine for its own address (never the live
// domain): any loopback name on the tests' port counts (round 2 item 22).

describe("e2e local Worker address check", () => {
  test("localhost, 127.0.0.1 and [::1] on the same port are the same local Worker", () => {
    for (const seen of ["localhost:8787", "127.0.0.1:8787", "[::1]:8787", "LOCALHOST:8787"])
      for (const target of ["localhost:8787", "127.0.0.1:8787", "[::1]:8787"]) expect(sameLocalWorker(seen, target), `${seen} / ${target}`).toBe(true);
  });

  test("the live domain, workers.dev, another port or nothing are refused", () => {
    for (const seen of ["mslab.diipsolutions.eu", "mslab-web.dim-novare.workers.dev", "localhost:3000", "localhost.evil.example:8787", "", "?"])
      expect(sameLocalWorker(seen, "localhost:8787"), seen).toBe(false);
    expect(sameLocalWorker("localhost:8787", "mslab.diipsolutions.eu")).toBe(false);
  });
});
