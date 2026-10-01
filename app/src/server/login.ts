import { z } from "zod";
import type { Db } from "@/db/client";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import { createLoginToken, isAllowedAdmin } from "./auth";
import { logFailure } from "./log";
import { sendMail, type Env } from "./notify";
import { RATE_LIMIT, RATE_WINDOW_SEC, rateKey, rateLimit } from "./ratelimit";

// POST /api/auth/request without Next.js: api/auth/request/route.ts builds the dependencies (database, Worker env,
// visitor IP, after()) and calls handleLoginRequest; the tests call it with PGlite and fakes.
//
// The answer never tells whether an address is allowed: an allowed and a not allowed address get the same
// `{ ok: true }` (the e-mail goes out after the response), and the rate limit counts every well-formed request.

export type LoginEnv = Env & { ADMIN_EMAILS: string };

export type LoginDeps = {
  db: Db;
  env: LoginEnv;
  /** The visitor's address (rate limit key); null when the request carries none (then it is not rate limited). */
  ip: string | null;
  /** Base of the link in the e-mail (allow-listed request origin, else SITE_URL). */
  siteUrl: string;
  now: Date;
  /** Runs work after the response has been sent: next/server after() in production, collected and awaited in tests. */
  later: (task: () => Promise<unknown>) => void;
};

export type LoginResult =
  | { status: 200; body: { ok: true; devLink?: string } }
  | { status: 400; body: { ok: false; error: "email" } }
  | { status: 429; body: { ok: false; error: "rate" } };

const bodySchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(200)) });

/** The link in the login e-mail. */
export const verifyUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, "")}/api/auth/verify?t=${encodeURIComponent(token)}`;

/** A rate limit that fails open: when KV is unavailable (or over its write quota) the admins can still sign in. */
async function withinRateLimit(deps: LoginDeps): Promise<boolean> {
  if (deps.ip === null) return true; // never on Cloudflare (cf-connecting-ip); one shared bucket would lock everybody out
  try {
    return await rateLimit(deps.env.KV, rateKey("login", deps.ip), RATE_LIMIT, RATE_WINDOW_SEC);
  } catch (e) {
    logFailure("[auth] rate limit unavailable, allowing", e);
    return true;
  }
}

/** Validation → rate limit (5 per 10 min per IP) → token and e-mail for an allowed address. Throws when the database fails. */
export async function handleLoginRequest(deps: LoginDeps, input: unknown): Promise<LoginResult> {
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { ok: false, error: "email" } };
  if (!(await withinRateLimit(deps))) {
    console.info("[auth] login request rate limited");
    return { status: 429, body: { ok: false, error: "rate" } };
  }

  const { email } = parsed.data;
  if (!isAllowedAdmin(email, deps.env.ADMIN_EMAILS)) {
    console.info("[auth] login request for an address outside the allow-list: nothing sent");
    return { status: 200, body: { ok: true } };
  }

  const link = verifyUrl(deps.siteUrl, await createLoginToken(deps.db, email, deps.now));
  deps.later(async () => {
    const sent = await sendMail(deps.env, { to: email, subject: adminEt.mail.subject, text: fill(adminEt.mail.text, { link }) });
    console.info(`[auth] login link e-mailed: ${sent}`);
  });
  // Tests and local development have no mailbox to read: the link comes back in the answer. Production builds
  // replace process.env.NODE_ENV with "production", so this branch is gone from them.
  return { status: 200, body: process.env.NODE_ENV !== "production" ? { ok: true, devLink: link } : { ok: true } };
}
