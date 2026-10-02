// Second step of `npm run cf-typegen`, after `wrangler types`.
//
// wrangler types the WORKER_SELF_REFERENCE service binding (a service bound to this Worker itself) and GlobalProps with
// `typeof import("./worker")`. That would pull worker.ts into every type-check (tsc, next build), and worker.ts imports
// the build output .open-next/worker.js, which a fresh checkout does not have: tsconfig.json leaves worker.ts out for
// that reason. So the binding is typed as the plain Fetcher OpenNext uses, and GlobalProps is dropped.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "cloudflare-env.d.ts";
const before = readFileSync(FILE, "utf8");
const after = before
  .replace(/Service<typeof import\("\.\/worker"\)\.default>/g, "Fetcher")
  .replace(/\r?\n\tinterface GlobalProps \{\r?\n\t\tmainModule: typeof import\("\.\/worker"\);\r?\n\t\}/g, "");
if (after.includes('import("./worker")')) throw new Error(`${FILE}: a reference to ./worker is left; update tools/env-types.mjs`);
writeFileSync(FILE, after);
console.log(`${FILE}: worker.ts references removed`);
