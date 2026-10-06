import type { Locator } from "@playwright/test";

/** The controls in `scope` less than 44 px tall (the touch target rule): the start of each one's HTML, for the failure message. */
export const smallTargets = (scope: Locator): Promise<string[]> =>
  scope
    .locator("a:visible, button:visible, input:visible, select:visible")
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.outerHTML.slice(0, 120)));
