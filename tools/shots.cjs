// Screenshot helper: node tools/shots.cjs <outDir> <width> <url> [url...]
// Prints overflow + console errors per page. Uses rempire-web's Playwright install.
const { chromium } = require("C:/Users/Dmitri.MARKIT/source/repos/rempire-web/node_modules/playwright");
(async () => {
  const [out, w, ...urls] = process.argv.slice(2);
  const width = +w;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("pageerror", (e) => errs.push(String(e)));
  let i = 0;
  for (const u of urls) {
    errs.length = 0;
    await page.goto(u, { waitUntil: "networkidle" });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(700);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
    const name = `${out}/${String(++i).padStart(2, "0")}-${width}.jpg`;
    await page.screenshot({ path: name, fullPage: true, type: "jpeg", quality: 70 });
    console.log(name, u, `overflow=${o.sw > o.cw ? o.sw - o.cw : 0}`, `h=${o.h}`, errs.length ? "ERR " + errs.join(" | ") : "");
  }
  await browser.close();
})();
