// The version of a stored piece of content, for the editors' stale guard: the content editor gets the version of what
// it loaded and sends it back with its save; the save is refused when the stored content has another version by then
// (someone saved it elsewhere meanwhile). The site tables other than courses have no updatedAt column, so the version is
// a hash of the stored value itself. Works in Node, the Worker and the browser (Web Crypto).

/** JSON with object keys in sorted order and dates as ISO strings, so the same value always gives the same text. */
export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/** 32 hex characters of the SHA-256 of the value's stable JSON. */
export async function contentVersion(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(digest).subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
