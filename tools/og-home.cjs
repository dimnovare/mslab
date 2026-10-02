// Renders tools/og-home.html to app/public/og.jpg (1200x630), the main site's link preview, from two screenshots of
// the home page (desktop 1440x900 and phone 390x844, first hero slide, no campaign popup, no review widget).
// Usage (from the repo root, the app's dev server or any deployment running):
//   node tools/og-home.cjs [base-url, default http://localhost:3000]
//   python tools/strip_provenance.py app/public
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require(path.join(__dirname, "..", "app", "node_modules", "@playwright", "test"));

const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const out = path.join(__dirname, "..", "app", "public", "og.jpg");

// Hidden in the screenshots: the review comment button, the dev server's indicator.
const HIDE = "#mslab-fb, nextjs-portal { display: none !important; }";

async function shot(browser, viewport, file, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: "reduce", isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(() => sessionStorage.setItem("mslab-camp", "1")); // the campaign popup counts as seen
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: file, type: "png" });
  await ctx.close();
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mslab-og-"));
  const desk = path.join(dir, "desk.png");
  const phone = path.join(dir, "phone.png");
  const browser = await chromium.launch();
  try {
    await shot(browser, { width: 1440, height: 900 }, desk, false);
    await shot(browser, { width: 390, height: 844 }, phone, true);
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
    const src = pathToFileURL(path.join(__dirname, "og-home.html"));
    src.search = new URLSearchParams({ desk: pathToFileURL(desk).href, phone: pathToFileURL(phone).href }).toString();
    await page.goto(src.href, { waitUntil: "networkidle" });
    await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
    await page.waitForTimeout(300);
    await page.screenshot({ path: out, type: "jpeg", quality: 86 });
    console.log(`og.jpg written (${fs.statSync(out).size} bytes) from ${base}`);
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
