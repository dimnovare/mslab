// Hub thumbnails: node tools/thumbs.cjs <baseUrl> key=path [key=path...]
// Writes site/guide/thumbs/<key>-d.jpg (1440x900 → 1200w) and <key>-m.jpg (390x760).
const path = require("path");
const { chromium } = require("C:/Users/Dmitri.MARKIT/source/repos/rempire-web/node_modules/playwright");
const out = path.join(__dirname, "..", "site", "guide", "thumbs");
(async () => {
  const [base, ...pairs] = process.argv.slice(2);
  require("fs").mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const [w, h, suf, scale] of [[1440, 900, "d", 0.8334], [390, 760, "m", 1]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const p of pairs) {
      const [key, rel] = p.split("=");
      await page.goto(base + rel, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(out, `${key}-${suf}.jpg`), type: "jpeg", quality: 78 });
      console.log(key, suf);
    }
    await ctx.close();
  }
  await browser.close();
})();
