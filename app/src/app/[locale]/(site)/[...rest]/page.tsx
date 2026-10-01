import { notFound } from "next/navigation";

// Any path without its own page gets the localized 404 (../not-found.tsx) inside the site shell.
export default function UnknownPage(): never {
  notFound();
}
