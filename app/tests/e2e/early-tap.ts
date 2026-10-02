import type { Page } from "@playwright/test";

/**
 * Reproduces, every time, the race behind the filter tests that used to fail under parallel load (Task 16 item 5):
 * a tap that lands after hydration but before Next.js's App Router has patched history.replaceState (it does so in an
 * effect after hydration). Such a tap's replaceState went to the browser alone: the address bar changed, Next.js kept
 * the old URL (useSearchParams, and the list filtered from it, stayed on the old query), and the history entry lost
 * Next.js's state (Back to it did nothing).
 *
 * The page's own patch is held back until the first replaceState after the first pointer press, and put in place as
 * soon as that call returns: the tap's own replaceState reaches the browser unpatched, exactly as in the race, and the
 * patch is there before anything React does next, as on a real page (React flushes the hydration effects, the patch
 * among them, before its next render). Putting it in place a microtask later was not faithful: React may render and
 * run the tap's effects at the end of the click, before that microtask.
 */
export async function holdBackRouterHistoryPatch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const native = History.prototype.replaceState;
    let held: History["replaceState"] | undefined;
    let armed = false;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      delete (window.history as Partial<History>).replaceState; // the accessor below; History.prototype's is native
      if (held) window.history.replaceState = held;
    };
    function beforeRouterPatch(this: History, data: unknown, unused: string, url?: string | URL | null) {
      native.call(window.history, data, unused, url);
      if (armed) release();
    }
    Object.defineProperty(window.history, "replaceState", {
      configurable: true,
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
