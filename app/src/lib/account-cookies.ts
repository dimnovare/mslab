// The client account's cookie names, shared by the server (server/client-auth.ts, server/account-api.ts) and the browser
// (components/account/useAccount.ts, lib/favourites.ts), and the one reading of the hint. Nothing else here: the browser bundle
// imports this file.

/**
 * The readable hint cookie `mslab_in=1`, set and cleared next to the HttpOnly session cookie. It grants nothing: it only lets
 * a cached page show "Minu konto" instead of "Logi sisse" without asking the server.
 */
export const HINT_COOKIE = "mslab_in";

/** Does a Cookie string carry the hint `mslab_in=1`? (The browser's "signed in", as far as the hint says: hasAccountHint.) */
export const hintIn = (cookie: string): boolean => cookie.split(";").some((part) => part.trim() === `${HINT_COOKIE}=1`);
