// The site address used in links that leave the site (newsletter confirmation e-mail, admin link in Maria's
// notifications). The request's own origin is used when it is one of ours, so a sign-up on the Vercel production URL
// (before the domain switch) gets a link to that URL; anything else (a forged Host / Origin) falls back to SITE_URL.

/** The fixed part of the allow-list: the public domain, the local development server and the training centre's old domains. */
const FIXED_LINK_ORIGINS: readonly string[] = [
  "https://mslab.diipsolutions.eu",
  "http://localhost:3000",
  "https://mslab.ee",
  "https://www.mslab.ee",
];

/** The Vercel system variables that name this deployment's own hosts (no scheme): the platform sets them, a visitor cannot. */
const VERCEL_HOST_VARIABLES = ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"] as const;

/**
 * The allow-list: FIXED_LINK_ORIGINS plus this deployment's own Vercel hosts (the production URL, the branch URL and the
 * deployment URL), each only when its variable is set and not empty. The variables are platform settings read at run
 * time, never anything from a request. They are read from `process.env` (not serverEnv) because they are not
 * configuration and must not fail a build that runs without them.
 */
export function linkOrigins(source: Record<string, string | undefined> = process.env): readonly string[] {
  const own: string[] = [];
  for (const name of VERCEL_HOST_VARIABLES) {
    const host = source[name]?.trim();
    if (!host) continue;
    try {
      own.push(new URL(`https://${host}`).origin);
    } catch {
      // not a host: left out
    }
  }
  return [...FIXED_LINK_ORIGINS, ...own];
}

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

/** Is `host` (a Host header) this machine: localhost, 127.0.0.1 or [::1], with or without a port? */
export const isLocalHost = (host: string | null | undefined): boolean => !!host && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

/**
 * scheme + Host header, nothing else: no Origin and no x-forwarded-host, which a client can send. Vercel routes a
 * request by its Host, so the Host of a request that reached this app is one of its own names. The login link is built from this; null without a Host.
 */
export function hostOrigin(headers: Pick<Headers, "get">): string | null {
  const host = headers.get("host");
  if (!host) return null;
  return `${isLocalHost(host) ? "http" : "https"}://${host}`;
}

/** The base for outgoing links: `origin` when it is in linkOrigins(), otherwise SITE_URL. No trailing slash. */
export function linkBase(origin: string | null | undefined, siteUrl: string): string {
  if (origin) {
    try {
      const o = new URL(origin).origin;
      if (linkOrigins().includes(o)) return o;
    } catch {
      // not a URL: fall back
    }
  }
  return trimSlash(siteUrl);
}
