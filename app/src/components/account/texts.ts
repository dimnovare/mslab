import type { Dict } from "@/i18n/locales";

// The dictionary parts the account's client components get, picked on the server (the static /konto… shells, and the
// admin's read-only "view as client"), so a page sends only these strings to the browser, not the whole dictionary.

export type ShellTexts = Dict["account"]["shell"];

/** AccountLoader's: another device signed in, loading, the data could not be loaded. */
export type LoaderTexts = Dict["account"]["loader"];

export type CoursesTexts = Dict["account"]["dashboard"] & {
  /** The card sentences (account.next, filled with domain/account-cards.ts nextStep's vars). */
  next: Dict["account"]["next"];
  loader: LoaderTexts;
};

export const shellTexts = (d: Dict): ShellTexts => d.account.shell;

export const loaderTexts = (d: Dict): LoaderTexts => d.account.loader;

export const coursesTexts = (d: Dict): CoursesTexts => ({ ...d.account.dashboard, next: d.account.next, loader: loaderTexts(d) });
