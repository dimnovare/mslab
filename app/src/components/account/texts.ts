import type { Dict } from "@/i18n/locales";

// The dictionary parts the account's client components get, picked on the server (the static /konto shells, and the
// admin's read-only "view as client"), so a page sends only these strings to the browser, not the whole dictionary.

export type ShellTexts = Dict["account"]["shell"];

export type CoursesTexts = Dict["account"]["dashboard"] & {
  /** The card sentences (account.next, filled with domain/account-cards.ts nextStep's vars). */
  next: Dict["account"]["next"];
  /** Another device signed in since (one device only). */
  replaced: string;
  sendCode: string;
};

export const shellTexts = (d: Dict): ShellTexts => d.account.shell;

export const coursesTexts = (d: Dict): CoursesTexts => ({
  ...d.account.dashboard,
  next: d.account.next,
  replaced: d.account.signedOut.replaced,
  sendCode: d.account.signedOut.sendCode,
});
