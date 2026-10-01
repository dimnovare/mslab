import { LOCAL_FIXTURES, removeFormRows, removeSeatFixtures } from "./fixtures";

// Removes the seat fixtures and the rows the form tests stored, and fails the run if any of them is left behind.
export default async function globalTeardown(): Promise<void> {
  if (!LOCAL_FIXTURES) return;
  const left = await removeFormRows();
  await removeSeatFixtures();
  if (left !== 0) throw new Error(`e2e: ${left} rows of the form tests are still in the database`);
}
