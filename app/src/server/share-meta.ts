import type { Metadata } from "next";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { href } from "@/i18n/href";
import { getDict, type Locale } from "@/i18n/locales";
import { hostOrigin, linkBase } from "./site";

/** The link preview picture (public/og.jpg, made from the home page by tools/og-home.cjs). ?v= changes with the file. */
export const OG_IMAGE = { url: "/og.jpg?v=1", width: 1200, height: 630, type: "image/jpeg" } as const;

/**
 * Link preview tags (Open Graph and the Twitter / X card) for a shared link: the site's name, title and description
 * in the page's language and the home page picture. Absolute addresses use the host the page was opened on when it is
 * one of ours (workers.dev now, the custom domain later), else SITE_URL. `path`: the page's own address (og:url).
 */
export async function shareMetadata(locale: Locale, path?: string): Promise<Pick<Metadata, "metadataBase" | "openGraph" | "twitter">> {
  const d = getDict(locale);
  let siteUrl = "https://mslab.diipsolutions.eu";
  try {
    siteUrl = getCloudflareContext().env.SITE_URL || siteUrl;
  } catch {
    // outside a request (build): the default
  }
  const base = linkBase(hostOrigin(await headers()), siteUrl);
  const image = { ...OG_IMAGE, alt: d.meta.ogAlt };
  return {
    metadataBase: new URL(base),
    openGraph: {
      type: "website",
      siteName: d.common.siteName,
      locale: locale === "ru" ? "ru_RU" : "et_EE",
      title: d.meta.title,
      description: d.meta.description,
      images: [image],
      ...(path === undefined ? {} : { url: href(locale, path) }),
    },
    twitter: { card: "summary_large_image", title: d.meta.title, description: d.meta.description, images: [image] },
  };
}
