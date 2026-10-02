import { notFound } from "next/navigation";

// Every address without a page of its own is rewritten to "/<locale>/leidmata" (lib/site-routing.ts), so this page is
// rendered once per locale and cached like the others (status 404, the site shell around it): a scan of unknown
// addresses is answered from the cache, and cannot fill it with a copy per address.
// The localized 404 itself is ../not-found.tsx.

/** Rendered on the first visit and cached, like every public page (app/[locale]/layout.tsx). */
export function generateStaticParams(): { rest: string[] }[] {
  return [];
}

export default function UnknownPage(): never {
  notFound();
}
