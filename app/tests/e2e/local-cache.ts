import { readFileSync } from "node:fs";
import { PROD_BUILD, TARGET } from "./target";

// The local production build (E2E_PROD_BUILD) caches the public pages like the deployed Worker. A fixture written
// straight to the database (seat fixtures, snapshots put back, sample session dates) would not show on a cached page:
// the app revalidates only what its own saves change. So after such a write every page is marked stale, as
// revalidatePath("/", "layout") would: a row for the root layout's tag (every page carries it) in the tag cache, the
// local D1 that `wrangler dev` serves (written through its local explorer API).

/** The D1 key OpenNext gives a tag ("<build id>/<tag>", open-next d1-next-tag-cache). */
const tagKey = (buildId: string, tag: string) => `${buildId}/${tag}`.replaceAll("//", "/");

function databaseId(): string {
  const m = /"binding":\s*"NEXT_TAG_CACHE_D1"[^}]*"database_id":\s*"([^"]+)"/.exec(readFileSync("wrangler.jsonc", "utf8"));
  if (!m) throw new Error("e2e: NEXT_TAG_CACHE_D1 not found in wrangler.jsonc");
  return m[1];
}

/** Marks every cached page of the local production build stale (nothing to do against `next dev`). */
export async function revalidateLocalPages(): Promise<void> {
  if (!PROD_BUILD) return;
  const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
  // the explorer API takes string parameters only; the INTEGER columns store them as numbers
  const now = String(Date.now());
  const sql = "INSERT INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)";
  const res = await fetch(`${new URL(TARGET).origin}/cdn-cgi/local/explorer/api/d1/database/${databaseId()}/raw`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql, params: [tagKey(buildId, "_N_T_/layout"), now, now, now] }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
  if (!res.ok || !body?.success) throw new Error(`e2e: could not revalidate the local pages (${res.status})`);
}
