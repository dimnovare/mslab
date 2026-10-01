import { applySeatFixtures, LOCAL_FIXTURES } from "./fixtures";

// Runs once per `playwright test` run (whatever the file or --grep filter): seat fixtures for the calendar tests.
export default async function globalSetup(): Promise<void> {
  if (LOCAL_FIXTURES) await applySeatFixtures();
}
