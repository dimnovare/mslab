import { getPlatformProxy } from "wrangler";

// The local KV of `next dev` (miniflare, .wrangler/state — never the deployed namespace): the review comment e2e tests
// remove the comments they post. The comment API has no delete, so this opens the same local store the dev server uses.

/** Text every e2e comment starts with, so a run can find the leftovers of an interrupted one. */
export const E2E_COMMENT = "[e2e-kommentaar]";

async function withLocalKv<T>(fn: (kv: KVNamespace) => Promise<T>): Promise<T> {
  // envFiles: [] like @opennextjs/cloudflare's dev context; no remote bindings (local persistence only)
  const { env, dispose } = await getPlatformProxy<{ KV: KVNamespace }>({ envFiles: [], remoteBindings: false });
  try {
    return await fn(env.KV);
  } finally {
    await dispose();
  }
}

async function deleteRecord(kv: KVNamespace, id: string): Promise<boolean> {
  const key = await kv.get(`id:${id}`);
  if (key) await kv.delete(key);
  await kv.delete(`id:${id}`);
  return !!key;
}

/** Deletes these comments (record and id index) from the local KV. */
export function deleteLocalComments(ids: string[]): Promise<void> {
  return withLocalKv(async (kv) => {
    for (const id of ids) await deleteRecord(kv, id);
  });
}

/** Deletes every e2e comment still in the local KV; returns how many there were. */
export function removeLeftoverComments(): Promise<number> {
  return withLocalKv(async (kv) => {
    let n = 0;
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: "fb:", cursor });
      for (const { name } of page.keys) {
        const rec = await kv.get<{ id?: string; text?: string }>(name, "json");
        if (!rec?.text?.startsWith(E2E_COMMENT)) continue;
        await kv.delete(name);
        if (rec.id) await kv.delete(`id:${rec.id}`);
        n++;
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return n;
  });
}
