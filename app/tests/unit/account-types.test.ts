import type { ComponentProps } from "react";
import { expect, test } from "vitest";
import type { CoursesTab } from "@/components/account/CoursesTab";
import { coursesTexts } from "@/components/account/texts";
import { getDict } from "@/i18n/locales";
import type { Dashboard } from "@/server/client-data";

// A type test, checked by `tsc --noEmit -p .` (this file is in the project): CoursesTab's read-only view needs the
// dashboard as the server loaded it — without `data` the component would load the visitor's own account. A
// `@ts-expect-error` that no longer meets an error fails tsc ("Unused '@ts-expect-error' directive").

type Props = ComponentProps<typeof CoursesTab>;

const t = coursesTexts(getDict("et"));
const data: Dashboard = {
  client: { email: "kati@example.test", name: "", phone: "", locale: "et", newsletter: false },
  cards: [],
  favourites: [],
  prepayment: null,
  resume: null,
};

const ownAccount: Props = { locale: "et", t };
const ownAccountSaid: Props = { locale: "et", t, readOnly: false };
const adminView: Props = { locale: "et", t, data, readOnly: true };
const serverData: Props = { locale: "et", t, data };

// @ts-expect-error read-only without the dashboard data does not compile
const readOnlyWithoutData: Props = { locale: "et", t, readOnly: true };

// @ts-expect-error nor does an undefined dashboard with read-only
const readOnlyUndefinedData: Props = { locale: "et", t, data: undefined, readOnly: true };

test("the allowed shapes of CoursesTab's props (the forbidden ones are compile errors above)", () => {
  expect([ownAccount, ownAccountSaid, adminView, serverData].map((p) => Boolean(p.readOnly))).toEqual([false, false, true, false]);
  expect([readOnlyWithoutData, readOnlyUndefinedData]).toHaveLength(2);
});
