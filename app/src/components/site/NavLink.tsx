"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { publicPath } from "@/i18n/href";

/** A menu link that marks itself active on its page and on the pages below it (/koolitused/...). */
export function NavLink({
  href,
  className,
  activeClassName,
  children,
}: {
  href: string;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const path = publicPath(usePathname());
  const exact = path === href;
  const active = exact || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={[className, active && activeClassName].filter(Boolean).join(" ") || undefined}
      aria-current={exact ? "page" : active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}
