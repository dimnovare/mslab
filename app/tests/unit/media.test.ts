import { expect, test } from "vitest";
import { mediaUrl } from "@/lib/media";

test("static seed paths and absolute URLs are returned unchanged", () => {
  expect(mediaUrl("/seed/flower-hero.png")).toBe("/seed/flower-hero.png");
  expect(mediaUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
});

test("R2 keys are served from /media", () => {
  expect(mediaUrl("img/abc.jpg")).toBe("/media/img/abc.jpg");
  expect(mediaUrl("img/abc def.jpg")).toBe("/media/img/abc%20def.jpg");
});

test("an empty key stays empty", () => {
  expect(mediaUrl("")).toBe("");
});

test("a protocol-relative key never passes through as another host's address", () => {
  for (const key of ["//evil.example/a.jpg", "///evil.example/a.jpg", "/\\evil.example/a.jpg", "\\\\evil.example/a.jpg", "\\/evil.example/a.jpg"])
    expect(mediaUrl(key), key).toBe("");
  // still a normal site path or R2 key
  expect(mediaUrl("/seed/a.jpg")).toBe("/seed/a.jpg");
  expect(mediaUrl("img//a.jpg")).toBe("/media/img//a.jpg");
});
