// Renders tools/og.html to site/guide/og.jpg (1200x630) for link previews.
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("C:/Users/Dmitri.MARKIT/source/repos/rempire-web/node_modules/playwright");
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
  await p.goto(pathToFileURL(path.join(__dirname, "og.html")).href, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, "..", "site", "guide", "og.jpg"), type: "jpeg", quality: 86 });
  await b.close();
  console.log("og.jpg written");
})();
