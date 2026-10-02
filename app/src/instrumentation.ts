// Next.js calls register() once when a server instance starts. In production it checks the configuration there, so a
// deployment that lacks DATABASE_URL (or another required variable) fails to start with an error that names the
// variable, instead of every request failing one by one. Outside production the required variables have local
// defaults (server/env.ts), so this does nothing there.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { serverEnv } = await import("./server/env");
  serverEnv();
}
