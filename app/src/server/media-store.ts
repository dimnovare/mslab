import { serverEnv, type ServerEnv } from "./env";
import type { MediaStore } from "./media";
import { localStore } from "./media-local";
import { r2Store } from "./r2";

// Which store holds the uploaded images, decided by the environment (server/env.ts):
// - all four R2 variables set: Cloudflare R2 through its S3 API (server/r2.ts), in production and in development;
// - none set, outside production: a folder, app/.media-local (server/media-local.ts), so `next dev` needs no bucket;
// - none set, in production: no store. Uploads are refused (503 `storage`) and /media answers 404: a server's own disk
//   is no place for uploads (it is gone with the next deployment), so there is no folder fallback there. Unless
//   MEDIA_LOCAL is "1": the production build on this machine (`next build && next start`, the e2e run) uses the folder.
//   Never on Vercel (VERCEL is set there, build and runtime): the variable is ignored and the answer is the same as
//   without it, the clear 503 `storage`;
// - only some set: a mistake. No store either (the folder would hide it), and the log names the variables that are
//   missing, once per process (every /media request asks for the store: a line each would flood the log).

type R2Env = Pick<ServerEnv, "R2_ACCOUNT_ID" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET" | "MEDIA_LOCAL">;
const R2_VARIABLES = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

// The notes already logged live on globalThis, like the database pool (db/client.ts): `next dev` evaluates a module
// again on every hot reload, and the production build may bundle it into more than one server chunk.
const shared = globalThis as typeof globalThis & { __mslabMediaNotes?: Set<string> };

/** The store to use, or null when there is none. `env`, `production` and `localDir` are for the tests. */
export function mediaStore(env: R2Env = serverEnv(), production: boolean = process.env.NODE_ENV === "production", localDir?: string): MediaStore | null {
  const missing = R2_VARIABLES.filter((name) => !env[name]);
  if (missing.length === 0) return r2Store({ accountId: env.R2_ACCOUNT_ID!, accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, bucket: env.R2_BUCKET! });
  if (missing.length < R2_VARIABLES.length) {
    const note = `[media] R2 is only partly configured, not set: ${missing.join(", ")}`;
    const noted = (shared.__mslabMediaNotes ??= new Set()); // the text names variables, never values
    if (!noted.has(note)) {
      noted.add(note);
      console.error(note);
    }
    return null;
  }
  // a folder on a Vercel function would be gone with the invocation: MEDIA_LOCAL cannot switch it on there
  const localBuild = env.MEDIA_LOCAL === "1" && !process.env.VERCEL;
  return production && !localBuild ? null : localStore(localDir);
}
