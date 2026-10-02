import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Guard: no real e-mail address in any tracked file under app/, tools/ or docs/ (the repository is public). Personal
// addresses are environment variables of the deployment (Vercel project settings), never a file of the repository; the
// tests, local development and the docs use placeholders (.env.example, "Dim's address" / "Maria's address" in prose).
//
// Allowed: addresses at domains reserved for examples (example.com / example.<tld> and their subdomains, the .test,
// .example, .invalid and .localhost names, RFC 2606 / 6761), GitHub's noreply addresses, and the few public,
// non-personal addresses below. A free-mail address (Gmail) is never allowed.

const REPO = join(process.cwd(), "..");
const ROOTS = ["app", "tools", "docs"];

/** Not scanned: Maria's two feedback documents (leaving the repository) and lockfiles (third-party package metadata). */
const SKIPPED = [/^docs\/feedback\/2026-10-01-maria-/, /(^|\/)package-lock\.json$/];

/** Public, non-personal addresses, each with the reason it may appear. */
const PUBLIC: Record<string, string> = {
  "info@mslab.ee": "the training centre's public contact address (site content, prototypes)",
  "info@send.diipsolutions.eu": "the site's sending address (MAIL_FROM)",
  "nimi@e-post.ee": "an Estonian form placeholder ('name@e-mail')",
  "sinu@email.ee": "an Estonian form placeholder in the prototypes ('your@email')",
  "arved@ilustuudio.ee": "a made-up salon's invoice address in the prototype sample data",
  "noreply@anthropic.com": "the noreply address of the commit co-author trailer",
};

const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const RESERVED = /(^|\.)(example\.[a-z]+|[a-z0-9-]+\.(test|example|invalid|localhost)|test|example|invalid|localhost)$/i;
const FREE_MAIL = new RegExp(["gmail", "googlemail"].map((d) => `@${d}\\.com$`).join("|"), "i");

/** Is this address allowed in the repository? */
export function allowedAddress(address: string): boolean {
  const a = address.toLowerCase();
  if (FREE_MAIL.test(a)) return false;
  const domain = a.slice(a.lastIndexOf("@") + 1);
  return RESERVED.test(domain) || domain === "users.noreply.github.com" || a in PUBLIC;
}

/** The password and host of a URL's credentials ("scheme://user:pw@host"), which only look like an address. */
const URL_CREDENTIALS = /\/\/[^\s/@:]*:$/;

/** The addresses in `text` that are not allowed: "<path>:<line>: <address>". */
export function realAddresses(path: string, text: string): string[] {
  return text.split(/\r?\n/).flatMap((line, i) =>
    [...line.matchAll(ADDRESS)]
      .filter((m) => !URL_CREDENTIALS.test(line.slice(0, m.index)) && !allowedAddress(m[0]))
      .map((m) => `${path}:${i + 1}: ${m[0]}`),
  );
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", ...ROOTS], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((f) => f && !SKIPPED.some((r) => r.test(f)));
}

describe("no real e-mail address in the repository", () => {
  test("every tracked text file under app/, tools/ and docs/", () => {
    const files = trackedFiles();
    expect(files.length).toBeGreaterThan(200); // the check is not vacuous
    const found = files.flatMap((f) => {
      const bytes = readFileSync(join(REPO, f));
      if (bytes.subarray(0, 8000).includes(0)) return []; // binary (images, fonts)
      return realAddresses(f, bytes.toString("utf8"));
    });
    expect(found).toEqual([]);
  });

  test("the rule: free mail and other real domains are caught; examples, test names and URL credentials are not", () => {
    const at = (local: string, domain: string) => `${local}@${domain}`; // (built, so this file holds no address itself)
    for (const real of [at("someone", "gmail.com"), at("Some.One", "GMail.com"), at("x", "googlemail.com"), at("maria", "mslab.ee"), at("a", "b.ee"), at("dim", "outlook.com")])
      expect(realAddresses("x.ts", `const ADMIN = "${real}";`), real).toHaveLength(1);
    for (const ok of ["admin@example.test", "second.admin@example.test", "a@example.com", "x@db.example.com", "p@proxy.railway.example", "u@localhost.evil.example", "dim@users.noreply.github.com", "info@mslab.ee", "nimi@e-post.ee"])
      expect(realAddresses("x.ts", `"${ok}"`), ok).toEqual([]);
    expect(realAddresses("x.ts", `postgres://u:${at("p", "x.proxy.rlwy.net")}:123/railway`)).toEqual([]);
    expect(realAddresses("x.ts", `"https://user:${at("pw", "facebook.com")}/x"`)).toEqual([]);
    expect(realAddresses("x.ts", `"mailto:${at("someone", "gmail.com")}"`)).toHaveLength(1);
    expect(realAddresses("x.ts", `a ${at("one", "gmail.com")} b ${at("two", "example.com")}`)).toEqual([`x.ts:1: ${at("one", "gmail.com")}`]);
    expect(allowedAddress(at("info", "gmail.com"))).toBe(false); // never, whatever the list says
  });
});
