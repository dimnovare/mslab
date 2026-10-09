// The newsletter's welcome code (phase 2c, spec 5): Seaded "Tervituskood" (settings key "newsletter", field welcomeCode), sent after
// an address's first confirmation in the welcome mail and shown on the confirmed page. Pure: no database, no React.

/** The longest welcome code. */
export const WELCOME_CODE_MAX = 30;

const SHAPE = /^[A-Z0-9-]{1,30}$/;

/** As the admin typed it → as stored: trimmed, in capitals. */
export const normalizeWelcomeCode = (typed: string): string => typed.trim().toUpperCase();

/** A code that may be stored: A–Z, 0–9 and "-", at most 30; "" (no code) too. */
export const isWelcomeCode = (code: string): boolean => code === "" || SHAPE.test(code);

/** The stored `newsletter` setting → its welcome code, or "" (none, or a value of another shape: never shown). */
export function welcomeCodeOf(setting: unknown): string {
  const value = setting && typeof setting === "object" && !Array.isArray(setting) ? (setting as Record<string, unknown>).welcomeCode : null;
  return typeof value === "string" && SHAPE.test(value) ? value : "";
}

/**
 * The fragment the confirmation link's redirect carries to the home page: `kood=<CODE>`. A fragment, never the query: the home page is
 * cached for every visitor, and no server or cache ever sees a fragment (FlashNotice reads it in the browser and removes it).
 */
export const welcomeFragment = (code: string): string => `kood=${code}`;

/** The welcome code in a page's fragment (without "#"), read back only in its own shape. */
export const WELCOME_FRAGMENT = /^kood=([A-Z0-9-]{1,30})$/;
