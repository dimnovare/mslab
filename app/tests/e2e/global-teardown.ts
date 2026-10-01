import { LOCAL_FIXTURES, removeSeatFixtures } from "./fixtures";

// Removes the seat fixtures again and fails the run if any of them is left behind.
export default async function globalTeardown(): Promise<void> {
  if (LOCAL_FIXTURES) await removeSeatFixtures();
}
