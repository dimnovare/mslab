// Read-only smoke test of the deployed Worker under the Workers Free CPU limit (Task 17). GET requests only.
//
//   node tools/cache-smoke.mjs [base]            (default https://mslab-web.dim-novare.workers.dev)
//
// 1. 60 sequential requests, about one per second, across 8 public pages (ET and RU);
// 2. 30 back-to-back requests to one course page.
// Any answer that is not 200 is an error: Cloudflare's "error code: 1102" (CPU limit) comes as a 503. The script also
// counts how each page was served (x-page-cache: front = the cached-page front, x-opennext-cache = OpenNext,
// otherwise rendered) and exits with 1 when anything failed.

const base = (process.argv[2] ?? "https://mslab-web.dim-novare.workers.dev").replace(/\/+$/, "");
const PAGES = [
  "/",
  "/koolitused",
  "/koolitused/kulmumeistri-baaskoolitus",
  "/koolituskalender",
  "/ru",
  "/ru/koolitused/lash-lift-botox",
  "/ru/praktika",
  "/ru/uudised",
];
const COURSE = "/koolitused/kulmumeistri-baaskoolitus";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const started = Date.now();
  try {
    const res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "mslab-cache-smoke" } });
    const body = await res.text();
    const how = res.headers.get("x-page-cache") ?? (res.headers.get("x-opennext-cache") ? `opennext-${res.headers.get("x-opennext-cache")}` : (res.headers.get("x-nextjs-cache") ?? "rendered").toLowerCase());
    const error = res.status === 200 ? null : `${res.status} ${body.slice(0, 40).replace(/\s+/g, " ")}`;
    return { path, status: res.status, ms: Date.now() - started, how, error };
  } catch (e) {
    return { path, status: 0, ms: Date.now() - started, how: "-", error: String(e) };
  }
}

function report(title, rows) {
  const errors = rows.filter((r) => r.error);
  const how = {};
  for (const r of rows) how[r.how] = (how[r.how] ?? 0) + 1;
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n${title}: ${rows.length} requests, ${errors.length} errors; served: ${JSON.stringify(how)}; time median ${ms[Math.floor(ms.length / 2)]} ms, max ${ms.at(-1)} ms`);
  for (const r of errors) console.log(`  ERROR ${r.path}: ${r.error}`);
  return errors.length;
}

console.log(`cache smoke test against ${base} (${new Date().toISOString()})`);
const sequential = [];
for (let i = 0; i < 60; i++) {
  const r = await get(PAGES[i % PAGES.length]);
  sequential.push(r);
  console.log(`${String(i + 1).padStart(2)} ${r.status} ${String(r.ms).padStart(5)} ms ${r.how.padEnd(14)} ${r.path}`);
  await sleep(Math.max(0, 1000 - r.ms));
}
const burst = [];
for (let i = 0; i < 30; i++) burst.push(await get(COURSE));
const failed = report("A. 60 sequential, ~1/s, 8 pages ET + RU", sequential) + report(`B. 30 back-to-back, ${COURSE}`, burst);
console.log(failed === 0 ? "\nPASS: 0 errors" : `\nFAIL: ${failed} errors`);
process.exit(failed === 0 ? 0 : 1);
