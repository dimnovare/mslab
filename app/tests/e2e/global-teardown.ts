import { LOCAL_FIXTURES, removeAdminFixtures, removeAdminRows, removeFormRows, removeSeatFixtures } from "./fixtures";

// Removes the seat fixtures, the rows the form and admin sign-in tests stored and the admin inbox fixtures, and fails the
// run if any of them is left behind. (The sign-in tests delete the token and session rows of the real admin addresses
// themselves, by hash.)
export default async function globalTeardown(): Promise<void> {
  if (!LOCAL_FIXTURES) return;
  const left = (await removeFormRows()) + (await removeAdminRows()) + (await removeAdminFixtures());
  await removeSeatFixtures();
  if (left !== 0) throw new Error(`e2e: ${left} rows of the form / sign-in / admin inbox tests are still in the database`);
}
