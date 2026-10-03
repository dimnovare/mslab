// The client account's cookie names, shared by the server (server/client-auth.ts, server/account-api.ts) and the browser
// (components/account/useAccount.ts). Nothing else here: the browser bundle imports this file.

/**
 * The readable hint cookie `mslab_in=1`, set and cleared next to the HttpOnly session cookie. It grants nothing: it only lets
 * a cached page show "Minu konto" instead of "Logi sisse" without asking the server.
 */
export const HINT_COOKIE = "mslab_in";
