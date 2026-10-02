import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FeedbackEnv, Reply } from "@/server/feedback";
import { reviewKey } from "@/server/review-key";
import { hostOrigin, linkBase } from "@/server/site";

// Shared by the two comment routes (./route.ts and ./[id]/route.ts).

export const reply = (r: Reply) => Response.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });

/** The env, the base of the comment links (allow-listed Host, else SITE_URL) and the list key for this request. */
export function feedbackContext(request: Request) {
  const env = getCloudflareContext().env as FeedbackEnv;
  const h = request.headers;
  return {
    env,
    origin: linkBase(hostOrigin(h), env.SITE_URL),
    key: reviewKey(env.ADMIN_KEY, { dev: process.env.NODE_ENV === "development", host: h.get("host") }),
  };
}
