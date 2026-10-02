import { notFound } from "next/navigation";

// Every address without a page of its own is rewritten to "/<locale>/leidmata" (lib/site-routing.ts), so this page is
// rendered once per locale and cached like the others (status 404, the site shell around it): a scan of unknown
// addresses is answered from the cache, and cannot fill it with a copy per address.
// The localized 404 itself is ../not-found.tsx.
export default function UnknownPage(): never {
  notFound();
}
