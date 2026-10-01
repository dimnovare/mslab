import { Resend } from "resend";
import type { TextKv } from "./ratelimit";

// Outgoing notifications: e-mail through Resend and a Telegram ping to Maria. Both are best effort — callers store
// the submission first and never fail a request because of a notification. Without the secrets (local `next dev`
// has no RESEND_API_KEY / TELEGRAM_BOT_TOKEN) nothing is sent and a console note says so.

/** The bindings and secrets notifications use (a subset of the Worker env; secrets are optional). */
export type Env = {
  KV: TextKv;
  MAIL_FROM: string;
  MARIA_EMAIL: string;
  SITE_URL: string;
  RESEND_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  /** Optional override; otherwise the chat id remembered in KV under `tg:chat` (shared with the review site worker). */
  TELEGRAM_CHAT_ID?: string;
};

export type Mail = { to: string; subject: string; text: string; replyTo?: string };

const TELEGRAM_MAX = 3900;
export const TG_CHAT_KEY = "tg:chat";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Sends one plain-text e-mail. true = Resend accepted it. */
export async function sendMail(env: Env, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.info("[notify] RESEND_API_KEY is not set: e-mail skipped");
    return false;
  }
  try {
    const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
    if (error) {
      console.error("[notify] Resend rejected the e-mail:", error.name, error.message);
      return false;
    }
    console.info("[notify] Resend accepted the e-mail:", data?.id);
    return true;
  } catch (e) {
    console.error("[notify] Resend request failed:", errorText(e));
    return false;
  }
}

/**
 * Maria's chat (ported from worker/index.js): TELEGRAM_CHAT_ID if set; otherwise the id in KV `tg:chat`; otherwise the
 * first private chat that wrote to the bot (getUpdates), remembered in KV.
 */
export async function chatId(env: Env): Promise<string | null> {
  if (env.TELEGRAM_CHAT_ID) return env.TELEGRAM_CHAT_ID;
  const known = await env.KV.get(TG_CHAT_KEY);
  if (known) return known;
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`);
  if (!r.ok) {
    console.error("[notify] Telegram getUpdates:", r.status, (await r.text()).slice(0, 200));
    return null;
  }
  const d = (await r.json()) as { result?: { message?: { chat?: { id: number; type: string } } }[] };
  const chat = (d.result ?? []).map((u) => u.message?.chat).find((c) => c?.type === "private");
  if (!chat) return null;
  const id = String(chat.id);
  await env.KV.put(TG_CHAT_KEY, id);
  return id;
}

/** Sends a plain-text Telegram message to Maria. true = Telegram answered ok. */
export async function sendTelegram(env: Env, text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.info("[notify] TELEGRAM_BOT_TOKEN is not set: Telegram skipped");
    return false;
  }
  try {
    const chat = await chatId(env);
    if (!chat) {
      console.error("[notify] Telegram: no chat id (nobody has written to the bot yet)");
      return false;
    }
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, TELEGRAM_MAX), disable_web_page_preview: true }),
    });
    if (!r.ok) console.error("[notify] Telegram sendMessage:", r.status, (await r.text()).slice(0, 200));
    else console.info("[notify] Telegram accepted the message");
    return r.ok;
  } catch (e) {
    console.error("[notify] Telegram request failed:", errorText(e));
    return false;
  }
}

/** Link to the admin area in Maria's notifications (the admin itself arrives in a later task). */
export const adminUrl = (env: Pick<Env, "SITE_URL">) => `${env.SITE_URL.replace(/\/+$/, "")}/admin`;

/**
 * Tells Maria about a new submission: the full plain-text summary by e-mail (reply goes to the visitor when
 * `replyTo` is given) and a short Telegram ping (`short`, default the subject) with the admin link.
 */
export async function notifyMaria(
  env: Env,
  subject: string,
  text: string,
  opts: { short?: string; replyTo?: string } = {},
): Promise<{ mail: boolean; telegram: boolean }> {
  const [mail, telegram] = await Promise.all([
    sendMail(env, { to: env.MARIA_EMAIL, subject, text, replyTo: opts.replyTo }),
    sendTelegram(env, `${opts.short ?? subject}\n\n${adminUrl(env)}`),
  ]);
  return { mail, telegram };
}
