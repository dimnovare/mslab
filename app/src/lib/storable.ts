// Text Postgres can store: no NUL or other control character (a NUL in text is an error) and no lone surrogate (an error in a jsonb
// value). The account's input parser (server/account-input.ts) refuses anything else, and the browser leaves it out of what it sends
// (lib/favourites.ts, the favourites merge), so both sides agree on what a slug may be.

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export const storable = (s: string): boolean => !CONTROL.test(s) && !LONE_SURROGATE.test(s);
