/**
 * The port of the e2e run's fake Bunny: 3998, or E2E_BUNNY_PORT when that one is taken on this machine (a whole number from 1024
 * to 65535). Playwright, the app's dev server and the fake itself all read it from here, so they always agree.
 */
function fakePort(value: string | undefined): number {
  if (!value?.trim()) return 3998;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("e2e: E2E_BUNNY_PORT must be a port number from 1024 to 65535");
  return port;
}

const port = fakePort(process.env.E2E_BUNNY_PORT);

/** The e2e run's Bunny Stream: a fake on this machine (fake-bunny.ts) with made-up keys; the app's server is started with these. */
export const E2E_BUNNY = {
  port,
  url: `http://localhost:${port}`,
  libraryId: "424242",
  apiKey: "e2e-bunny-api-key",
  tokenKey: "e2e-bunny-token-key",
  webhookSecret: "e2e-bunny-webhook-secret",
} as const;
