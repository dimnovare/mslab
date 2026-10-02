import type { Page } from "@playwright/test";

/**
 * Reproduces, every time, the race behind the filter tests that used to fail under parallel load (Task 16 item 5):
 * a tap that lands after hydration but before Next.js's App Router has patched history.replaceState (it does so in an
 * effect after hydration). Such a tap's replaceState went to the browser alone: the address bar changed, Next.js kept
 * the old URL (useSearchParams, and the list filtered from it, stayed on the old query), and the history entry lost
 * Next.js's state (Back to it did nothing).
 *
 * The page's own patch is held back until the first replaceState after the first pointer press, then put in place in
 * a microtask: before React renders again, as React flushes the hydration effects (the patch among them) before its
 * next render. The tap's own replaceState call therefore reaches the browser unpatched, exactly as in the race.
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
      if (armed) queueMicrotask(release);
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
