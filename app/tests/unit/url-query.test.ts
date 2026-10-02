import { describe, expect, test } from "vitest";
import { catchUpDecision } from "@/lib/url-query";

// When an early filter write (before Next.js follows history changes) is told to the router (fix round 1, item a):
// never in a way that could cancel a navigation that has started since.

const at = (o: Partial<Parameters<typeof catchUpDecision>[0]>) =>
  catchUpDecision({ behindAt: "https://x.test/koolitused?vorm=k", href: "https://x.test/koolitused?vorm=k", follows: true, event: "pointerdown", ...o });

describe("catching the router up after an early write", () => {
  test("nothing written early: nothing to do", () => {
    expect(at({ behindAt: null })).toBe("wait");
    expect(at({ behindAt: null, event: "click", follows: false })).toBe("wait");
  });

  test("the router follows and the address is the one written: tell it now, at the start of the press", () => {
    for (const event of ["pointerdown", "keydown", "click"]) expect(at({ event })).toBe("tell");
  });

  test("the address has moved on (another page, a link followed): drop it, never restore over it", () => {
    expect(at({ href: "https://x.test/koolitused/kulmude-lami" })).toBe("drop");
    expect(at({ href: "https://x.test/koolitused?vorm=e", follows: false })).toBe("drop");
  });

  test("a click while the router does not follow yet: drop it (a navigation may start from that click)", () => {
    expect(at({ follows: false, event: "click" })).toBe("drop");
    expect(at({ follows: false, event: "pointerdown" })).toBe("wait");
    expect(at({ follows: false, event: "keydown" })).toBe("wait");
  });
});
