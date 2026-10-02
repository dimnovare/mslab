import { readFileSync } from "node:fs";
import { tagRows } from "../../src/server/tag-cache";
import { PROD_BUILD, TARGET } from "./target";

// The local production build (E2E_PROD_BUILD) caches the public pages like the deployed Worker. A fixture written
// straight to the database (seat fixtures, snapshots put back, sample session dates) would not show on a cached page:
// the app revalidates only what its own saves change. So after such a write every page is marked stale, as
// revalidatePath("/", "layout") would: a row for the root layout's tag (every page carries it) in the tag cache, the
// local D1 that `wrangler dev` serves (written through its local explorer API), in the app's own row format
// (src/server/tag-cache.ts).

function databaseId(): string {
  const m = /"binding":\s*"NEXT_TAG_CACHE_D1"[^}]*"database_id":\s*"([^"]+)"/.exec(readFileSync("wrangler.jsonc", "utf8"));
  if (!m) throw new Error("e2e: NEXT_TAG_CACHE_D1 not found in wrangler.jsonc");
  return m[1];
}

/** Marks every cached page of the local production build stale (nothing to do against `next dev`). */
export async function revalidateLocalPages(): Promise<void> {
  if (!PROD_BUILD) return;
  const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
  const [row] = tagRows(buildId, ["_N_T_/layout"], Date.now());
  const res = await fetch(`${new URL(TARGET).origin}/cdn-cgi/local/explorer/api/d1/database/${databaseId()}/raw`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // the explorer API takes string parameters only; the INTEGER columns store them as numbers
    body: JSON.stringify({ sql: row.sql, params: row.values.map(String) }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
  if (!res.ok || !body?.success) throw new Error(`e2e: could not revalidate the local pages (${res.status})`);
}

/**
 * The local production build must run with `wrangler dev --local-upstream localhost:8787`. Without it the Worker takes
 * the custom domain (the `routes` entry) for its own address, and Next.js's server-action redirects fetch their target
 * page from there: admin tests would send requests to the live site. The newsletter confirmation link answers with a
 * redirect to the Worker's own origin (an unknown token reads nothing), which shows which address it believes it has.
 */
export async function assertLocalUpstream(): Promise<void> {
  if (!PROD_BUILD) return;
  const res = await fetch(`${new URL(TARGET).origin}/api/newsletter/confirm?t=e2e-origin-check`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const host = location ? new URL(location, TARGET).host : "";
  if (host !== new URL(TARGET).host)
    throw new Error(`e2e: the local Worker sees itself as "${host || "?"}", not ${new URL(TARGET).host}: start it with \`npx wrangler dev --port 8787 --local-upstream localhost:8787\``);
}
