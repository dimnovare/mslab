import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SlideControl } from "@/components/site/SlideControl";

const render = (count: number) =>
  renderToStaticMarkup(
    createElement(SlideControl, {
      count,
      index: 0,
      paused: false,
      onSelect: () => {},
      onPrev: () => {},
      onNext: () => {},
      onTogglePause: () => {},
      labels: { group: "Slaidid", slide: "Slaid", prev: "Eelmine slaid", next: "Järgmine slaid", pause: "Peata slaidide vahetumine" },
    }),
  );

describe("hero slide control (round 2 item 17)", () => {
  test("one active slide: no pause toggle, since nothing plays", () => {
    expect(render(1)).not.toContain("data-slide-pause");
  });
  test("two or more slides: the pause toggle is there", () => {
    const html = render(2);
    expect(html).toContain("data-slide-pause");
    expect(html).toContain('aria-label="Peata slaidide vahetumine"');
    expect(html).toContain('aria-pressed="false"');
  });
});
