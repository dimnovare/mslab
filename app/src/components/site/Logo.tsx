import Image from "next/image";
import Link from "next/link";

/**
 * MS LAB logo (public/brand/logo.png, 332x128, already trimmed). The caller's className sets the box size
 * (B: 168x66 desktop, 140x55 phone) and, on dark surfaces, inverts the image.
 */
export function Logo({ href, label, className, eager = false }: { href: string; label: string; className?: string; eager?: boolean }) {
  return (
    <Link href={href} className={className} aria-label={label}>
      <Image src="/brand/logo.png" alt="" width={332} height={128} unoptimized loading={eager ? "eager" : "lazy"} />
    </Link>
  );
}
