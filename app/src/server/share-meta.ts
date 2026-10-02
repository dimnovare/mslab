import type { Metadata } from "next";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { href } from "@/i18n/href";
import { getDict, type Locale } from "@/i18n/locales";
import { hostOrigin, linkBase } from "./site";

/** The link preview picture (public/og.jpg, made from the home page by tools/og-home.cjs). ?v= changes with the file. */
export const OG_IMAGE = { url: "/og.jpg?v=1", width: 1200, height: 630, type: "image/jpeg" } as const;

/** What a page tells about itself in its link preview; without it the preview names the site only. */
export type SharePage = {
  /** The page's own address (og:url), a site path ("/", "/koolitused/x"); the locale prefix is added. */
  path: string;
  title: string;
  description: string;
  /** The page's own picture (a site path such as "/media/img/x.jpg"); the home page picture when there is none. */
  image?: string;
};

/**
 * Link preview tags (Open Graph and the Twitter / X card). Absolute addresses use the host the page was opened on when
 * it is one of ours (workers.dev now, the custom domain later), else SITE_URL.
 *
 * Without `page` (the locale layout, so every public page): the site's name, language, type and the home page picture
 * only; a crawler takes the title and description from the page's own <title> and description. With `page` (the home
 * page, a course, a post): that page's address, title, description and picture.
 */
export async function shareMetadata(locale: Locale, page?: SharePage): Promise<Pick<Metadata, "metadataBase" | "openGraph" | "twitter">> {
  const d = getDict(locale);
  let siteUrl = "https://mslab.diipsolutions.eu";
  try {
    siteUrl = getCloudflareContext().env.SITE_URL || siteUrl;
  } catch {
    // outside a request (build): the default
  }
  const base = linkBase(hostOrigin(await headers()), siteUrl);
  const image = page?.image ? { url: page.image, alt: page.title } : { ...OG_IMAGE, alt: d.meta.ogAlt };
  const site = { type: "website" as const, siteName: d.common.siteName, locale: locale === "ru" ? "ru_RU" : "et_EE", images: [image] };
  if (!page) return { metadataBase: new URL(base), openGraph: site, twitter: { card: "summary_large_image", images: [image] } };
  return {
    metadataBase: new URL(base),
    openGraph: { ...site, url: href(locale, page.path), title: page.title, description: page.description },
    twitter: { card: "summary_large_image", title: page.title, description: page.description, images: [image] },
  };
}
