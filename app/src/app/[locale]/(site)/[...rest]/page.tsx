import { notFound } from "next/navigation";

// Rendered for each request, never cached: a cached copy per unknown address would let anyone fill the page cache.
export const dynamic = "force-dynamic";

// Any path without its own page gets the localized 404 (../not-found.tsx) inside the site shell.
export default function UnknownPage(): never {
  notFound();
}
