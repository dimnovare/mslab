import { test } from "@playwright/test";

// Not a check of the site: the anchor of the run order in playwright.config.ts. The projects "chromium" and "mobile"
// depend on the two "before-edits-*" projects that run this file; their teardowns, "chromium-edit" and "mobile-edit"
// (admin-edit.spec.ts, which changes public content), start only after all of those tests have finished.
test("the public and admin tests run before the content edits", () => {});
