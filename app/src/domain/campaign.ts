// The public campaign popup (Task 14; Maria C37–C41: M1, M3, M4): which stored campaign the home page shows, with which
// button text, and when. Pure: no database, no React.

import type { Campaign, PopupKind } from "@/db/schema";
import { pick, type I18n } from "@/i18n/field";
import type { Locale } from "@/i18n/locales";
import { mediaUrl } from "@/lib/media";
import { CAMPAIGN_CTA } from "./site-editor";

/** What the popup's card shows (components/site/CampaignCard), in the page's language. */
export type CampaignView = {
  /** A public URL (mediaUrl of the stored key). */
  image: string;
  kicker: string;
  title: string;
  text: string;
  code: string;
  ctaLabel: string;
  /** As stored (a site path without the locale, or an https address); the card makes the link from it. */
  ctaHref: string;
};

/** sessionStorage key, set when the popup is shown: once per browser session (prototype D: "kord külastuse jooksul"). */
export const CAMPAIGN_SEEN_KEY = "mslab-camp";
/** D opens the popup 6 s after the home page appears. */
export const CAMPAIGN_DELAY_MS = 6000;

/**
 * The delay before the popup opens: D's 6 s, unless the page carries a test's own (window.__mslabCampaignDelay, set by
 * the e2e tests' init script so that they need not wait 6 s each) — a finite number of ms, 0 or more.
 */
export function campaignDelay(testValue: unknown): number {
  return typeof testValue === "number" && Number.isFinite(testValue) && testValue >= 0 ? testValue : CAMPAIGN_DELAY_MS;
}

/**
 * The button text (M4). Maria's own text for the page's language wins; with none, the dictionary's "Leia enda koolitus"
 * in that language (`fallback`). The admin stores the Estonian default when she leaves the field empty, so the stored
 * default counts as no text of her own; any other Estonian text of hers is shown on a Russian page that has no Russian
 * text (content falls back to Estonian).
 */
export function campaignCtaLabel(label: I18n | null | undefined, locale: Locale, fallback: string): string {
  const own = locale === "ru" ? label?.ru?.trim() : "";
  if (own) return own;
  const et = label?.et?.trim() ?? "";
  return et && et !== CAMPAIGN_CTA ? et : fallback;
}

/**
 * The popup's card for the home page, or null when there is no popup: no row, a switched-off campaign, a row of another kind (the
 * newsletter popup: newsletterPopupView), or one without a title (the dialog is named by its title; the admin requires one for an
 * active campaign).
 */
export function campaignView(c: Campaign | null | undefined, locale: Locale, ctaFallback: string): CampaignView | null {
  if (!c?.active || c.kind !== "campaign") return null;
  const title = pick(c.title, locale).trim();
  if (!title) return null;
  return {
    image: mediaUrl(c.imageKey),
    kicker: pick(c.kicker, locale),
    title,
    text: pick(c.text, locale),
    code: c.code.trim(),
    ctaLabel: campaignCtaLabel(c.ctaLabel, locale, ctaFallback),
    ctaHref: c.ctaHref,
  };
}

/** What the newsletter popup's card shows (components/site/NewsletterPopupCard), in the page's language (phase 2c). */
export type NewsletterPopupView = { image: string; kicker: string; title: string; text: string };

/** localStorage key, set after a sign-up from the newsletter popup, and by the confirmed landing: this browser never sees that popup again (spec 5). */
export const NEWSLETTER_SIGNED_KEY = "mslab-nl";

/** The query parameter the newsletter confirmation link lands on the home page with: ?uudiskiri=kinnitatud | vigane | viga (FlashNotice's `param`). */
export const NEWSLETTER_LANDING_PARAM = "uudiskiri";

/** The value of the landing parameter in an address's query string (`location.search`): any value, empty too; null when the address has none. */
export function newsletterLanding(search: string): string | null {
  return new URLSearchParams(search).get(NEWSLETTER_LANDING_PARAM);
}

/**
 * The newsletter popup's card for the home page (phase 2c), or null: no row, a switched-off one, another kind (the campaign: campaignView)
 * or one without a title (the dialog is named by its title). The welcome code is never in it: it comes after the confirmation.
 */
export function newsletterPopupView(c: Campaign | null | undefined, locale: Locale): NewsletterPopupView | null {
  if (!c?.active || c.kind !== "newsletter") return null;
  const title = pick(c.title, locale).trim();
  if (!title) return null;
  return { image: mediaUrl(c.imageKey), kicker: pick(c.kicker, locale), title, text: pick(c.text, locale) };
}

/** What "Lehel näidatakse" (admin Hüpikaken, phase 2c) is set to: one of the popups, or none. */
export type PopupChoice = PopupKind | "off";

/** The choice the two rows' `active` flags say (the database allows at most one on; were both, the campaign would be the one). */
export function popupShown(campaignActive: boolean, newsletterActive: boolean): PopupChoice {
  return campaignActive ? "campaign" : newsletterActive ? "newsletter" : "off";
}

/** The two rows' `active` flags for a choice: at most one on. */
export function popupFlags(choice: PopupChoice): Record<PopupKind, boolean> {
  return { campaign: choice === "campaign", newsletter: choice === "newsletter" };
}
