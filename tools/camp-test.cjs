// Opens each direction in the hub viewer, presses "% Kampaania", screenshots the result.
const { chromium } = require("C:/Users/Dmitri.MARKIT/source/repos/rempire-web/node_modules/playwright");
(async () => {
  const [out, w] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: +w, height: +w < 800 ? 844 : 900 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  for (const k of ["a", "b", "c", "d"]) {
    await p.goto(`http://localhost:8790/guide/?t${k}${w}#vaade=${k}&seade=${+w < 800 ? "mob" : "desk"}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    await p.click("#vCamp");
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/camp-${k}-${w}.jpg`, type: "jpeg", quality: 70 });
    console.log(k, "ok");
  }
  console.log(errs.length ? "ERR " + errs.join(" | ") : "no page errors");
  await b.close();
})();
