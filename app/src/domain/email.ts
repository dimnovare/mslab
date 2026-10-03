export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

/** Address shape; at most 254 characters (the SMTP limit), which also bounds the regex work on hostile input. */
export const isEmail = (s: string): boolean => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** Sample and test data (`@example.test`) is never mailed: the domain does not exist, and bounces hurt the sender. */
export const isSampleAddress = (email: string): boolean => normalizeEmail(email).endsWith("@example.test");

// Common domains and their frequent misspellings (Estonian and Russian users).
const FIX: Record<string, string> = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.ee": "gmail.com", "gnail.com": "gmail.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com", "yandex.r": "yandex.ru", "mail.r": "mail.ru", "inbox.r": "inbox.ru",
};

/** The intended domain when `domain` is a known misspelling, else null. */
export const fixDomain = (domain: string): string | null => FIX[domain.toLowerCase()] ?? null;

/** "Kas mõtlesid …?": the corrected address when the domain is a known misspelling, else null. */
export function typoSuggestion(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fixed = fixDomain(email.slice(at + 1));
  return fixed ? email.slice(0, at + 1) + fixed : null;
}
