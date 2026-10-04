// The notices an account page hands to the page it opens next, as the address's fragment: a fragment never reaches a server, so
// no cache or log holds it, and a static page stays the same for every visitor (the browser reads it, says it once and removes it).
// Never a query (tests/unit/account-guards.test.ts). Plain constants, so server and client components can both import them.

/** "Minu andmed" after a save that changed the account's language: the same tab in that language says "Salvestatud.". */
export const SAVED_MARK = "salvestatud";

/** The home page after the account was deleted: "Konto on kustutatud." (FlashNotice). */
export const DELETED_MARK = "konto-kustutatud";

/**
 * Minu koolitused right after the login link was used (the verify redirect: /konto#sisse): this browser forgets the copy of the
 * favourites the previous session left (components/account/useAccount.ts), so another person's hearts never show here. A login
 * with the code forgets it in the login form itself.
 */
export const LOGIN_MARK = "sisse";
