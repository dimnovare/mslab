import type { Locator, Page } from "@playwright/test";

// Touch swipes on the phone project (isMobile + hasTouch). The swipes are real touch input: touchStart / touchMove /
// touchEnd sent through the Chrome DevTools Protocol (Input.dispatchTouchEvent), the same path as a finger on the
// screen — so native scrolling (scroll-snap tracks) and the React touch handlers (hero, lightbox) both receive them.
// Mouse drags would not exercise either.

/** Swipes across `el` horizontally: "left" moves the finger from 80% to 15% of its width (shows what is to the right). */
export async function swipe(page: Page, el: Locator, direction: "left" | "right", yAt = 0.5): Promise<void> {
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error("swipe target has no box");
  const y = box.y + box.height * yAt;
  const [fromX, toX] = direction === "left" ? [box.x + box.width * 0.8, box.x + box.width * 0.15] : [box.x + box.width * 0.15, box.x + box.width * 0.8];
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y }] });
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fromX + ((toX - fromX) * i) / steps, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

/** The element's horizontal scroll position. */
export const scrollLeft = (el: Locator): Promise<number> => el.evaluate((e) => e.scrollLeft);
