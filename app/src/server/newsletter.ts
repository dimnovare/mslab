import { eq, sql } from "drizzle-orm";
import type { Db, Q } from "@/db/client";
import { readSetting } from "@/db/queries/public";
import { clients, subscribers } from "@/db/schema";
import { isSampleAddress, normalizeEmail } from "@/domain/email";
import { welcomeCodeOf } from "@/domain/welcome-code";
import { welcomeMail } from "./account-mail";
import { reserveNewsletterMail } from "./client-auth";
import { logFailure, logNote } from "./log";
import { mailConfigured, sendMail, type Env } from "./notify";
import { forgetKey } from "./ratelimit";
import { confirmSubscriber } from "./submit";
import { sha256 } from "./token";

// The newsletter after the sign-up (phase 2c, spec 5): where an address stands (the admin's drawer, Minu andmed), the confirmation
// link's work, and the welcome mail with Seaded's "Tervituskood". Without Next.js: the confirm route and the account API build the
// dependencies; the tests pass PGlite, an in-memory KV and a stubbed Resend.

/** An address's newsletter: confirmed ("yes"), waiting for its confirmation ("pending"), or no row ("no"). */
export type NewsletterState = "yes" | "pending" | "no";

/** The newsletter state of an address (a row may hold it in any case). */
export async function newsletterState(db: Q, email: string): Promise<NewsletterState> {
  const [row] = await db.select({ confirmedAt: subscribers.confirmedAt }).from(subscribers).where(sql`lower(${subscribers.email}) = ${normalizeEmail(email)}`).limit(1);
  return !row ? "no" : row.confirmedAt ? "yes" : "pending";
}

/** A client's address, language and newsletter state; null when the client is gone. */
export async function clientNewsletter(db: Db, clientId: number): Promise<{ email: string; locale: "et" | "ru"; state: NewsletterState } | null> {
  const [client] = await db.select({ email: clients.email, locale: clients.locale }).from(clients).where(eq(clients.id, clientId)).limit(1);
  return client ? { ...client, state: await newsletterState(db, client.email) } : null;
}

export type WelcomeDeps = { db: Db; env: Env; now: Date };

/** A welcome mail is sent to an address at most once in this many seconds (a KV mark under the hash of the address). */
const WELCOME_ONCE_SEC = 365 * 24 * 60 * 60;

/**
 * The welcome mail with the welcome code, after an address's first confirmation (spec 5). Never throws, and logs no address and no
 * code. No mail when: no code is set; the address is a sample one; Resend is not set up; the address had its welcome this year (a KV
 * mark, read first and written only once the day's quota has a place for the mail; a store that fails lets the mail go, as the other
 * limits do); the newsletter's daily cap is reached (its own mail_quota row, shared with the sign-up confirmations, which never fails open — a capped day writes no mark, so a
 * later confirmation of that address can still bring it). A send that Resend refuses or that fails takes the mark away again, so that
 * address can still get its welcome (the place of the day's cap it spent stays spent).
 */
export async function sendWelcome(deps: WelcomeDeps, to: { email: string; locale: string }): Promise<void> {
  try {
    const address = normalizeEmail(to.email);
    if (isSampleAddress(address) || !mailConfigured(deps.env)) return;
    const code = welcomeCodeOf(await readSetting(deps.db, "newsletter"));
    if (!code) return;
    const mark = `rl:welcome:${await sha256(address)}`;
    try {
      if (await deps.env.KV.get(mark)) {
        console.info("[newsletter] welcome e-mail sent to this address before: not again");
        return;
      }
    } catch (e) {
      logFailure("[newsletter] welcome mark unavailable, sending", e);
    }
    if (!(await reserveNewsletterMail(deps.db, deps.now))) {
      logNote("[newsletter] daily mail cap reached: no welcome e-mail");
      return;
    }
    try {
      await deps.env.KV.put(mark, "1", { expirationTtl: WELCOME_ONCE_SEC });
    } catch (e) {
      logFailure("[newsletter] welcome mark not written", e);
    }
    let sent = false;
    try {
      sent = await sendMail(deps.env, welcomeMail(address, code, to.locale === "ru" ? "ru" : "et"));
    } catch (e) {
      logFailure("[newsletter] welcome e-mail failed to send", e);
    }
    console.info(`[newsletter] welcome e-mail sent: ${sent}`);
    if (!sent) {
      // Resend refused or failed: the mark must not keep her from the welcome for a year (the Minu andmed path loses the code, too). The
      // cap place spent above stays spent: the attempt did reach Resend, and a mail that keeps failing must not be retried without limit.
      try {
        await forgetKey(deps.env.KV, mark);
      } catch (e) {
        logFailure("[newsletter] welcome mark not removed", e);
      }
    }
  } catch (e) {
    logFailure("[newsletter] welcome e-mail failed", e);
  }
}

/**
 * The confirmation link (/api/newsletter/confirm): the subscriber confirmed; on the first confirmation with a welcome code set, the
 * welcome mail after the response (`later`) and the code for the confirmed page (the redirect's fragment). A repeat confirmation
 * gives no code and sends nothing. `locale`: the subscriber's, for the home page it lands on.
 */
export async function confirmNewsletter(
  deps: WelcomeDeps & { later: (task: () => Promise<unknown>) => void },
  token: string,
): Promise<{ outcome: "kinnitatud" | "vigane"; locale: "et" | "ru"; code: string | null }> {
  const confirmed = await confirmSubscriber(deps.db, token, deps.now);
  if (!confirmed) return { outcome: "vigane", locale: "et", code: null };
  const locale = confirmed.sub.locale === "ru" ? "ru" : "et";
  if (!confirmed.first) return { outcome: "kinnitatud", locale, code: null };
  // The confirmation has stood by now, and the next click is no longer "first": a failing settings read must not turn this answer into
  // an error or drop the welcome mail. The page then shows no code (the mail still carries it: sendWelcome reads the setting itself).
  let code = "";
  try {
    code = welcomeCodeOf(await readSetting(deps.db, "newsletter"));
    if (!code) return { outcome: "kinnitatud", locale, code: null }; // read fine, no code set: no mail either
  } catch (e) {
    logFailure("[newsletter] settings unavailable after the confirmation, no code on the page", e);
  }
  const to = { email: confirmed.sub.email, locale };
  deps.later(() => sendWelcome(deps, to));
  return { outcome: "kinnitatud", locale, code: code || null };
}
