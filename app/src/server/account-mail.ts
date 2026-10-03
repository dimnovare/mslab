import { fill } from "@/i18n/format";
import { getDict, type Locale } from "@/i18n/locales";
import type { Mail } from "./notify";

// The client account's login e-mail: a big 6-digit code and one "Logi sisse" button, both valid 30 minutes
// (server/client-auth.ts LOGIN_TTL_MS). The texts are `account.mail` in the dictionaries, and the e-mail has two bodies made
// from the same parts: HTML (the code large, the button) and, as the fallback for clients that show no HTML, plain text.
// The subject carries the code, so a phone shows it in the notification.

/** The link in the login e-mail: it signs in the device that opens it (api/konto verify). */
export const verifyLink = (siteUrl: string, token: string): string => `${siteUrl.replace(/\/+$/, "")}/api/konto/verify?t=${encodeURIComponent(token)}`;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for an HTML body or attribute: nothing a value holds can open a tag or end an attribute. */
const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** The site's colours (src/styles/tokens.css: --ink, --paper, --canvas, --line, --lilac); an e-mail has no CSS variables. */
const INK = "#222222";
const PAPER = "#ffffff";
const CANVAS = "#f6f4f5";
const LINE = "#e6e1e3";
const LILAC = "#e8e0e5";
/** The site's fonts where installed (an e-mail cannot load web fonts), else the client's own. */
const FONT = "Jost, Manrope, Arial, sans-serif";

/** The texts of the login e-mail (`account.mail`). */
type MailTexts = ReturnType<typeof getDict>["account"]["mail"];

/** The plain-text body: the same parts, one per line. */
function loginText(mail: MailTexts, code: string, link: string): string {
  return [
    mail.greeting, "",
    mail.codeIntro, "",
    code, "",
    `${mail.useCode} ${mail.orLink}`,
    link, "",
    mail.valid,
    mail.ignore, "",
    mail.signature,
  ].join("\n");
}

/**
 * The HTML body: a centred card, the code large on its own line, one button (an ink pill, the site's primary button, at
 * least 44 px tall) and the link written out small below it for clients that do not show buttons. Tables and inline
 * styles only: no images, no external CSS, no web fonts. Every value is escaped.
 */
function loginHtml(mail: MailTexts, subject: string, locale: Locale, code: string, link: string): string {
  const text = (size: number, extra = "") => `font:400 ${size}px/1.5 ${FONT};color:${INK};${extra}`;
  const row = (style: string, content: string) => `<tr><td style="${style}">${content}</td></tr>`;
  return [
    "<!doctype html>",
    `<html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:${CANVAS};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};"><tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;background:${PAPER};border:1px solid ${LINE};border-radius:20px;">`,
    row(`padding:32px 28px 0;font:600 22px/1.3 ${FONT};color:${INK};`, esc(mail.greeting)),
    row(`padding:16px 28px 0;${text(16)}`, esc(mail.codeIntro)),
    row("padding:12px 28px 0;", `<div style="background:${LILAC};border-radius:12px;padding:16px 0 16px 8px;text-align:center;font:600 32px/1.2 ${FONT};letter-spacing:8px;color:${INK};-webkit-user-select:all;user-select:all;">${esc(code)}</div>`),
    row(`padding:16px 28px 0;${text(16)}`, esc(mail.useCode)),
    row(`padding:12px 28px 0;${text(16)}`, esc(mail.orLink)),
    row(
      "padding:16px 28px 0;",
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" height="48" bgcolor="${INK}" style="background:${INK};border-radius:99px;mso-padding-alt:0 32px;">` +
        `<a href="${esc(link)}" style="display:inline-block;padding:0 32px;height:48px;line-height:48px;font:600 16px/48px ${FONT};color:${PAPER};text-decoration:none;border-radius:99px;">${esc(mail.button)}</a>` +
        "</td></tr></table>",
    ),
    row(`padding:12px 28px 0;text-align:center;${text(12, "word-break:break-all;")}`, `<a href="${esc(link)}" style="color:${INK};text-decoration:underline;">${esc(link)}</a>`),
    row(`padding:24px 28px 0;${text(14)}`, esc(mail.valid)),
    row(`padding:4px 28px 0;${text(14)}`, esc(mail.ignore)),
    row(`padding:24px 28px 32px;${text(14)}`, esc(mail.signature)),
    "</table></td></tr></table></body></html>",
  ].join("");
}

/** The login e-mail for `email`, in `locale`: HTML with a plain-text fallback. `siteUrl` is the base of the link (site.ts linkBase). */
export function loginMail(siteUrl: string, email: string, token: string, code: string, locale: Locale): Mail {
  const mail = getDict(locale).account.mail;
  const link = verifyLink(siteUrl, token);
  const subject = fill(mail.subject, { code });
  return { to: email, subject, text: loginText(mail, code, link), html: loginHtml(mail, subject, locale, code, link) };
}
