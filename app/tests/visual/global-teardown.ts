import e2eTeardown from "../e2e/global-teardown";
import { LOCAL_FIXTURES } from "../e2e/fixtures";

export default async function visualTeardown(): Promise<void> {
  if (LOCAL_FIXTURES) await e2eTeardown();
}
