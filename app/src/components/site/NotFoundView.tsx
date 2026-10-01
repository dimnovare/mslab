"use client";

import { useParams } from "next/navigation";
import { Notice } from "./Notice";

export type NotFoundTexts = { title: string; text: string; links: { href: string; label: string }[] };

/** not-found.tsx receives no props; the locale comes from the route params of the URL that was not found. */
export function NotFoundView({ texts }: { texts: { et: NotFoundTexts; ru: NotFoundTexts } }) {
  const params = useParams<{ locale?: string }>();
  const t = params?.locale === "ru" ? texts.ru : texts.et;
  return <Notice title={t.title} text={t.text} links={t.links} />;
}
