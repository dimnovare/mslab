import type { Page } from "@playwright/test";

/**
 * Reproduces, every time, the race behind the filter tests that used to fail under parallel load (Task 16 item 5):
 * a tap that lands after hydration but before Next.js's App Router has patched history.replaceState (it does so in an
 * effect after hydration). Such a tap's replaceState went to the browser alone: the address bar changed, Next.js kept
 * the old URL (useSearchParams, and the list filtered from it, stayed on the old query), and the history entry lost
 * Next.js's state (Back to it did nothing).
 *
 * The page's own patch is caught by a setter on History.prototype (so window.history has no replaceState of its own,
 * as before the real patch) and held back until the first replaceState after the first pointer press. It is put in
 * place as soon as that call returns: the tap's own replaceState reaches the browser unpatched, exactly as in the race,
 * and the patch is there before anything React does next, as on a real page (React flushes the hydration effects, the
 * patch among them, before its next render).
 */
export async function holdBackRouterHistoryPatch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const proto = History.prototype;
    const native = proto.replaceState;
    let held: History["replaceState"] | undefined;
    let armed = false;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      Object.defineProperty(proto, "replaceState", { value: native, writable: true, configurable: true, enumerable: true });
      if (held) window.history.replaceState = held; // Next.js's patch, an own property of window.history, as it would be
    };
    function beforeRouterPatch(this: History, data: unknown, unused: string, url?: string | URL | null) {
      native.call(this, data, unused, url);
      if (armed) release();
    }
    Object.defineProperty(proto, "replaceState", {
      configurable: true,
      enumerable: true,
      get: () => beforeRouterPatch,
      set: (fn: History["replaceState"]) => {
        held = fn; // Next.js's patch (and its Strict Mode re-run in dev): the last one assigned is the one to install
      },
    });
    document.addEventListener("pointerdown", () => (armed = true), true);
  });
}

/**
 * Makes React's scheduled work (its MessageChannel tasks: transitions, deferred effects) wait `ms` once
 * `window.__slowScheduler` is set, as on a busy phone. Used to check that a click right after a filter still navigates:
 * telling Next.js's router about the filter's URL (a RESTORE) after a link click has started a navigation would cancel
 * that navigation, so it must never be left to late, scheduled work.
 */
export async function slowScheduler(page: Page, ms: number): Promise<void> {
  await page.addInitScript((delay) => {
    const Native = window.MessageChannel;
    class SlowChannel extends Native {
      constructor() {
        super();
        const post = this.port2.postMessage.bind(this.port2);
        this.port2.postMessage = (message: unknown) => {
          if ((window as unknown as { __slowScheduler?: boolean }).__slowScheduler) setTimeout(() => post(message), delay);
          else post(message);
        };
      }
    }
    window.MessageChannel = SlowChannel;
  }, ms);
}
