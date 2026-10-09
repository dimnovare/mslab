import { isEmail, normalizeEmail } from "@/domain/email";

// What the login page's address carries (pure: LoginForm reads it in the browser, tests/unit/login-address.test.ts).
//
// The parameters live in the FRAGMENT: `/konto/sisene#viga=link`, `#korda=1`, `#email=…`, `#email=…&kood=1`, `#valja=1`. A fragment is never sent to a server,
// so no log, cache or scanner can hold it (Next.js keeps the address of the request that renders a page, query included, in the
// page it caches for every later visitor; the middleware answers a query on an account page with a 303 that moves the known
// parameters into the fragment). The query is still read, for links already out there (an e-mail with `?viga=link`, a bookmark).

const KNOWN = ["viga", "korda", "email", "kood", "valja"] as const;

/**
 * The fragment an account page adds when it sends a visitor here because the server found her signed out (useAccount): the login
 * page then shows its form and never sends her on to "Minu konto" (forwardsSignedIn), so a hint cookie that was not cleared cannot
 * send her back and forth between the two pages.
 */
export const SIGNED_OUT_MARK = "valja=1";

/** The login page's password step (phase 2c): the fragment `#parool`, so that a reload opens it again. Not a parameter: it is left in the address. */
export const PASSWORD_MARK = "parool";

export type LoginAddress = {
  /** `viga`: the e-mail's button was used already or is too old (`link`), or our database failed (`server`). */
  problem: "link" | "server" | null;
  /** `korda=1`: send a code to the remembered e-mail at once ("Saada uus kood" on an account page). */
  again: boolean;
  /** `email`: an address to put in the field (trimmed, lower-cased; "" when absent or not an address). */
  email: string;
  /**
   * `kood=1`: open at the code step for `email` without sending anything, because the code is already in the visitor's mailbox (the
   * confirmation e-mail of a registration that asked for an account). false without `email`: there is no address to type the code for.
   */
  code: boolean;
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
  const validEmail = isEmail(email) ? email : "";
  const code = get("kood") === "1" && validEmail !== ""; // read before the parameters are removed below

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
    email: validEmail,
    code,
    cleaned,
  };
}

/**
 * Does the login page send this browser straight on to "Minu konto"? Yes when it is signed in (`signedIn`: the hint cookie) and its
 * address asks the page for nothing (spec 2.1, the fewest steps: the "Ava minu konto" button of every confirmation e-mail opens
 * this page, and a student who is signed in needs no code). No when the address (fragment or query) carries
 * - `viga` (a notice to show), `korda` (a code to send) or `kood` (the code step to open), whatever their values;
 * - `valja` (SIGNED_OUT_MARK): an account page has just found her signed out, so the hint is stale;
 * - an `email` other than `remembered`, the address this browser signed in with: a shared device, where the other person needs the
 *   form (something that is no address counts as none, as readLoginAddress reads it).
 * A stale hint therefore costs one trip at most: "Minu konto" answers 401, which clears the hint and sends her back with the mark.
 */
export function forwardsSignedIn(href: string, signedIn: boolean, remembered: string): boolean {
  if (!signedIn) return false;
  const url = new URL(href);
  const fromHash = fragmentParams(url.hash);
  const has = (name: string) => fromHash.has(name) || url.searchParams.has(name);
  if (["viga", "korda", "kood", "valja"].some(has)) return false;
  const given = normalizeEmail(fromHash.get("email") ?? url.searchParams.get("email") ?? "");
  return !isEmail(given) || given === normalizeEmail(remembered);
}
