/** A browser or proxy fetching a link ahead of the click (Chrome's `Sec-Purpose: prefetch`, older `Purpose: prefetch`); the login links must not be used up by it. */
export const isPrefetch = (h: Pick<Headers, "get">): boolean =>
  /prefetch|prerender/i.test(`${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""}`);
