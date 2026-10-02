// Next.js calls register() once when a server instance starts. In production it checks the configuration there, so a
// deployment that lacks DATABASE_URL (or another required variable) answers every request with a 500 and an error that
// names the variable (never its value), instead of failing on whichever request first needs it. Outside production the
// required variables have local defaults (server/env.ts), so this does nothing there.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { serverEnv } = await import("./server/env");
  serverEnv();
}
