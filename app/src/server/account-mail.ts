import { fill } from "@/i18n/format";
import { getDict, type Locale } from "@/i18n/locales";
import type { Mail } from "./notify";

// The client account's login e-mail (plain text): a big 6-digit code and the link, both valid 30 minutes
// (server/client-auth.ts LOGIN_TTL_MS). The texts are `account.mail` in the dictionaries; the subject carries the code, so a
// phone shows it in the notification.

/** The link in the login e-mail: it signs in the device that opens it (api/konto verify). */
export const verifyLink = (siteUrl: string, token: string): string => `${siteUrl.replace(/\/+$/, "")}/api/konto/verify?t=${encodeURIComponent(token)}`;

/** The login e-mail for `email`, in `locale`. `siteUrl` is the base of the link (site.ts linkBase). */
export function loginMail(siteUrl: string, email: string, token: string, code: string, locale: Locale): Mail {
  const { subject, text } = getDict(locale).account.mail;
  return { to: email, subject: fill(subject, { code }), text: fill(text, { code, link: verifyLink(siteUrl, token) }) };
}
