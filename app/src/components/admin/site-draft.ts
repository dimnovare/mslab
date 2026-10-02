import { stableJson } from "@/lib/version";

// How a site editor's draft follows the stored content (components/admin/useSiteDraft.ts). Pure, so the rules are
// unit-tested (tests/unit/site-draft.test.ts): no React, no fetch.

/** An editor page's parts as stored: their drafts and versions. */
export type Loaded<V> = { values: V; versions: Record<string, string> };

const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

/**
 * A save went through. Every saved part's stored value and version become the base. The draft takes the stored value
 * (trimmed, blank rows dropped) only where it is still what was sent: a part the admin went on editing while the save
 * was on its way (typing, an upload that finished) keeps her newer draft, which then stays unsaved (dirty) and is
 * sent with the new version next time, never lost.
 */
export function afterSave<V extends Record<string, unknown>>(
  draft: V,
  base: Loaded<V>,
  sent: Partial<V>,
  saved: { values: Record<string, unknown>; versions: Record<string, string> },
): { draft: V; base: Loaded<V> } {
  const nextDraft: Record<string, unknown> = { ...draft };
  const values: Record<string, unknown> = { ...base.values };
  const versions = { ...base.versions };
  for (const [k, value] of Object.entries(saved.values)) {
    values[k] = value;
    versions[k] = saved.versions[k];
    if (Object.hasOwn(sent, k) && same(draft[k], sent[k])) nextDraft[k] = value;
  }
  return { draft: nextDraft as V, base: { values: values as V, versions } };
}

/**
 * The page was rendered again with the stored content (after a save, or a reload after someone else's save). A part
 * stored with another version than the base follows it when the admin has no unsaved changes in it. A part she has
 * changed keeps her draft AND the version she loaded, so its next save is checked against the newer one (stale)
 * instead of silently overwriting it.
 */
export function afterReload<V extends Record<string, unknown>>(draft: V, base: Loaded<V>, initial: Loaded<V>): { draft: V; base: Loaded<V> } {
  const nextDraft: Record<string, unknown> = { ...draft };
  const values: Record<string, unknown> = { ...base.values };
  const versions = { ...base.versions };
  for (const k of Object.keys(initial.versions)) {
    if (initial.versions[k] === base.versions[k]) continue;
    if (!same(draft[k], base.values[k])) continue; // unsaved changes: hers stay, checked against the newer version on save
    values[k] = initial.values[k];
    versions[k] = initial.versions[k];
    nextDraft[k] = initial.values[k];
  }
  return { draft: nextDraft as V, base: { values: values as V, versions } };
}

/** The parts whose draft differs from the base. */
export const dirtyParts = <V extends Record<string, unknown>>(draft: V, base: Loaded<V>): (keyof V & string)[] =>
  (Object.keys(draft) as (keyof V & string)[]).filter((k) => !same(draft[k], base.values[k]));
