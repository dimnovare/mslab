// The parts of the settings table the site shell needs, with safe defaults (keys: see db/schema.ts settings).

export type FooterContact = { email: string; phone: string; instagram: string; facebook: string };
export type NewsletterSettings = { discountLabel: string };
export type ShellSettings = { newsletter: NewsletterSettings; contact: FooterContact; trainerName: string };

const DEFAULT_DISCOUNT = "10%";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function shellSettings(settings: Record<string, unknown>): ShellSettings {
  const contact = obj(settings.contact);
  return {
    newsletter: { discountLabel: str(obj(settings.newsletter).discountLabel) || DEFAULT_DISCOUNT },
    contact: { email: str(contact.email), phone: str(contact.phone), instagram: str(contact.instagram), facebook: str(contact.facebook) },
    trainerName: str(obj(settings.trainer).name),
  };
}
