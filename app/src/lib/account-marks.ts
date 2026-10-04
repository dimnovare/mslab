// The notices an account page hands to the page it opens next, as the address's fragment: a fragment never reaches a server, so
// no cache or log holds it, and a static page stays the same for every visitor (the browser reads it, says it once and removes it).
// Never a query (tests/unit/account-guards.test.ts). Plain constants, so server and client components can both import them.

/** "Minu andmed" after a save that changed the account's language: the same tab in that language says "Salvestatud.". */
export const SAVED_MARK = "salvestatud";

/** The home page after the account was deleted: "Konto on kustutatud." (FlashNotice). */
export const DELETED_MARK = "konto-kustutatud";
