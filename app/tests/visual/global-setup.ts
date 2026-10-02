import e2eSetup from "../e2e/global-setup";
import { LOCAL_FIXTURES } from "../e2e/fixtures";

// Locally: the e2e suite's own setup (local databases only, sample dates on today's schedule, the full / few seat
// fixtures, so the calendar pictures show every seat state). Against a deployment: nothing — the suite only reads.
export default async function visualSetup(): Promise<void> {
  if (LOCAL_FIXTURES) await e2eSetup();
}
