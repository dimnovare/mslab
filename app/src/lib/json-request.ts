// The one small JSON request the account's browser code sends to /api/konto/* (the login form, Minu andmed, Lemmikud, the
// course pages' ♡): same-origin with the session cookie, a JSON body, and an answer that never throws.

/** What came back: the HTTP status (0 when there was no answer at all) and the JSON object of the body ({} when it is not one). */
export type JsonAnswer = { status: number; data: Record<string, unknown> };

/** Sends `body` as JSON to `path` (POST unless said otherwise). `fetch` can be given (tests; lib/favourites.ts's own). Never throws. */
export async function sendJson(
  path: string,
  body: object,
  opts: { method?: "POST" | "PATCH" | "DELETE"; fetch?: typeof fetch } = {},
): Promise<JsonAnswer> {
  const send = opts.fetch ?? fetch;
  try {
    const res = await send(path, {
      method: opts.method ?? "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    return { status: res.status, data: typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {} };
  } catch {
    return { status: 0, data: {} };
  }
}

/** A 2xx answer whose body says `ok: true`: the API did it. */
export const isDone = (answer: JsonAnswer): boolean => answer.status >= 200 && answer.status < 300 && answer.data.ok === true;
