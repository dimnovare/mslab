// The static files the app serves at the site's root as they are (public/, and app/icon.svg): exact file names and whole
// folders. One list for the routing (lib/site-routing.ts: served without the locale rewrite) and the coming-soon gate
// (lib/site-gate.ts: always through), so the two cannot drift apart. tests/unit/site-gate.test.ts checks every entry of
// public/ against it. The design-review hub (public/guide, public/p) is not here: it has its own rules in both.

/** Files at the root, matched by their whole name ("/og.jpg", never "/og.jpg.bak"). og.png: the link preview's other format. */
export const ROOT_FILES = ["favicon.ico", "icon.svg", "robots.txt", "og.jpg", "og.png", "feedback.js"] as const;

/** Folders at the root whose files are all served ("/brand/logo.png"; the bare "/brand" is not a file). */
export const ROOT_FOLDERS = ["brand", "seed"] as const;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A regular expression source for a path after its leading "/": one of ROOT_FILES exactly, or anything in one of ROOT_FOLDERS. */
export const ROOT_FILE_SOURCE = `(?:${ROOT_FILES.map(escape).join("|")})$|(?:${ROOT_FOLDERS.map(escape).join("|")})\\/`;
