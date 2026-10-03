// Read-only smoke test of the deployed site on Vercel. GET and HEAD requests only: nothing is written, no form is sent.
//
//   node tools/cache-smoke.mjs [base]            (default https://mslab.diipsolutions.eu)
//
// A. 60 requests one after another, about one per second, across the main pages (ET and RU) and the hub;
// B. 30 requests at the same time, over the same pages.
// A request fails when it ends with anything but 2xx or 3xx (redirects are not followed: /guide -> /guide/ is fine) or
// does not answer within 20 s. Every fifth request is a HEAD, the others GET. The script also counts how Vercel served
// each answer (the x-vercel-cache header: HIT, MISS, STALE, PRERENDER, BYPASS, or "-" when the header is missing) and exits
// with 1 when anything failed.
//
// It is a check to run once after a deployment, not a load test: 90 requests in all.

const base = (process.argv[2] ?? "https://mslab.diipsolutions.eu").replace(/\/+$/, "");
if (!/^https?:\/\/[^/\s]+$/.test(base)) {
  console.error(`not a site address: ${base} (expected https://host, without a path)`);
  process.exit(2);
}

const PAGES = [
  // Estonian
  "/",
  "/koolitused",
  "/koolitused/kulmumeistri-baaskoolitus",
  "/koolituskalender",
  "/praktika",
  "/uudised",
  // Russian
  "/ru",
  "/ru/koolitused/lash-lift-botox",
  "/ru/praktika",
  "/ru/uudised",
  // the design hub and a prototype (static files of public/)
  "/guide/",
  "/p/d/",
];
const TIMEOUT_MS = 20_000;
const READ_ONLY = new Set(["GET", "HEAD"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One request. Never anything but GET or HEAD. */
async function hit(path, method) {
  if (!READ_ONLY.has(method)) throw new Error(`cache-smoke is read-only: ${method} is not allowed`);
  const started = Date.now();
  try {
    const res = await fetch(base + path, { method, redirect: "manual", headers: { "user-agent": "mslab-cache-smoke" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.arrayBuffer(); // the whole answer, as a visitor would wait for it (empty for HEAD)
    const how = (res.headers.get("x-vercel-cache") ?? "-").toUpperCase();
    const ok = res.status >= 200 && res.status < 400;
    return { path, method, status: res.status, ms: Date.now() - started, how, error: ok ? null : `status ${res.status}` };
  } catch (e) {
    return { path, method, status: 0, ms: Date.now() - started, how: "-", error: e instanceof Error ? e.name : "error" };
  }
}

const methodOf = (i) => (i % 5 === 4 ? "HEAD" : "GET");

function count(rows) {
  const served = {};
  for (const r of rows) served[r.how] = (served[r.how] ?? 0) + 1;
  return served;
}

function report(title, rows) {
  const errors = rows.filter((r) => r.error);
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n${title}: ${rows.length} requests, ${errors.length} errors; x-vercel-cache ${JSON.stringify(count(rows))}; time median ${ms[Math.floor(ms.length / 2)]} ms, max ${ms.at(-1)} ms`);
  for (const r of errors) console.log(`  ERROR ${r.method} ${r.path}: ${r.error}`);
  return errors.length;
}

console.log(`cache smoke test against ${base} (${new Date().toISOString()})`);

const sequential = [];
for (let i = 0; i < 60; i++) {
  const r = await hit(PAGES[i % PAGES.length], methodOf(i));
  sequential.push(r);
  console.log(`${String(i + 1).padStart(2)} ${r.method.padEnd(4)} ${r.status} ${String(r.ms).padStart(5)} ms ${r.how.padEnd(9)} ${r.path}`);
  await sleep(Math.max(0, 1000 - r.ms));
}

const parallel = await Promise.all(Array.from({ length: 30 }, (_, i) => hit(PAGES[(i * 5) % PAGES.length], methodOf(i))));

const failed = report("A. 60 one after another, about 1/s", sequential) + report("B. 30 at the same time", parallel);
console.log(`\nx-vercel-cache over all ${sequential.length + parallel.length} requests: ${JSON.stringify(count([...sequential, ...parallel]))}`);
console.log(failed === 0 ? "PASS: 0 errors" : `FAIL: ${failed} errors`);
process.exit(failed === 0 ? 0 : 1);
