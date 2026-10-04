import { isEmail, normalizeEmail } from "@/domain/email";

// What the login page's address carries (pure: LoginForm reads it in the browser, tests/unit/login-address.test.ts).
//
// The parameters live in the FRAGMENT: `/konto/sisene#viga=link`, `#korda=1`, `#email=…`. A fragment is never sent to a server,
// so no log, cache or scanner can hold it (Next.js keeps the address of the request that renders a page, query included, in the
// page it caches for every later visitor; the middleware answers a query on an account page with a 303 that moves the known
// parameters into the fragment). The query is still read, for links already out there (an e-mail with `?viga=link`, a bookmark).

const KNOWN = ["viga", "korda", "email"] as const;

export type LoginAddress = {
  /** `viga`: the e-mail's button was used already or is too old (`link`), or our database failed (`server`). */
  problem: "link" | "server" | null;
  /** `korda=1`: send a code to the remembered e-mail at once ("Saada uus kood" on an account page). */
  again: boolean;
  /** `email`: an address to put in the field (trimmed, lower-cased; "" when absent or not an address). */
  email: string;
  /** The address without the parameters, for history.replaceState (a reload must not repeat them); null when it carried none. */
  cleaned: string | null;
};

/** The `name=value` pairs of a fragment, when it is made of them (an anchor such as "#main" is none). */
function fragmentParams(hash: string): URLSearchParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return raw.includes("=") ? new URLSearchParams(raw) : new URLSearchParams();
}

/** Reads `href` (the page's address): the fragment first, then the query, so a new link wins over an old one in the same address. */
export function readLoginAddress(href: string): LoginAddress {
  const url = new URL(href);
  const fromHash = fragmentParams(url.hash);
  const get = (name: string): string | null => fromHash.get(name) ?? url.searchParams.get(name);
  const problem = get("viga");
  const again = get("korda") === "1";
  const email = normalizeEmail(get("email") ?? "");

  const present = KNOWN.some((name) => fromHash.has(name) || url.searchParams.has(name));
  let cleaned: string | null = null;
  if (present) {
    for (const name of KNOWN) {
      fromHash.delete(name);
      url.searchParams.delete(name);
    }
    // a fragment that is no list of parameters (an anchor) is kept as it is
    const hash = url.hash.includes("=") ? (fromHash.size > 0 ? `#${fromHash.toString()}` : "") : url.hash;
    cleaned = `${url.pathname}${url.search}${hash}`;
  }
  return {
    problem: problem === "link" || problem === "server" ? problem : null,
    again,
    email: isEmail(email) ? email : "",
    cleaned,
  };
}
