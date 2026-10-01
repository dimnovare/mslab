import type { I18n } from "@/i18n/field";

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

// ---- Trainer (home teaser, contact block): settings key "trainer" ----

export type TrainerStat = { value: string; label: I18n };
export type TrainerSettings = { name: string; role: I18n | null; portraitKey: string; contactPhotoKey: string; stats: TrainerStat[] };

const i18n = (v: unknown): I18n | null => {
  const o = obj(v);
  const et = str(o.et);
  if (!et) return null;
  const ru = str(o.ru);
  return ru ? { et, ru } : { et };
};

export function trainerSettings(settings: Record<string, unknown>): TrainerSettings {
  const t = obj(settings.trainer);
  const stats = Array.isArray(t.stats) ? t.stats : [];
  return {
    name: str(t.name),
    role: i18n(t.role),
    portraitKey: str(t.portraitKey),
    contactPhotoKey: str(t.contactPhotoKey) || str(t.portraitKey),
    stats: stats.flatMap((s) => {
      const value = str(obj(s).value);
      const label = i18n(obj(s).label);
      return value && label ? [{ value, label }] : [];
    }),
  };
}
