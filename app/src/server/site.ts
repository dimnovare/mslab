// The site address used in links that leave the site (newsletter confirmation e-mail, admin link in Maria's
// notifications). The request's own origin is used when it is one of ours, so a sign-up on the workers.dev preview
// gets a workers.dev link; anything else (a forged Host / Origin) falls back to SITE_URL.

export const LINK_ORIGINS: readonly string[] = [
  "https://mslab.diipsolutions.eu",
  "https://mslab-web.dim-novare.workers.dev",
  "http://localhost:3000",
  "https://mslab.ee",
  "https://www.mslab.ee",
];

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The origin a request came to: the Origin header (sent with form posts), else scheme + Host. null if unknown. */
export function requestOrigin(headers: Pick<Headers, "get">): string | null {
  const origin = headers.get("origin");
  if (origin && origin !== "null") return origin;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** The base for outgoing links: `origin` when it is allow-listed, otherwise SITE_URL. No trailing slash. */
export function linkBase(origin: string | null | undefined, siteUrl: string): string {
  if (origin) {
    try {
      const o = new URL(origin).origin;
      if (LINK_ORIGINS.includes(o)) return o;
    } catch {
      // not a URL: fall back
    }
  }
  return trimSlash(siteUrl);
}
