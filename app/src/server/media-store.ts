import { serverEnv, type ServerEnv } from "./env";
import type { MediaStore } from "./media";
import { localStore } from "./media-local";
import { r2Store } from "./r2";

// Which store holds the uploaded images, decided by the environment (server/env.ts):
// - all four R2 variables set: Cloudflare R2 through its S3 API (server/r2.ts), in production and in development;
// - none set, outside production: a folder, app/.media-local (server/media-local.ts), so `next dev` needs no bucket;
// - none set, in production: no store. Uploads are refused (503 `storage`) and /media answers 404: a server's own disk
//   is no place for uploads (it is gone with the next deployment), so there is no folder fallback there;
// - only some set: a mistake. No store either (the folder would hide it), and the log names the variables that are missing.

type R2Env = Pick<ServerEnv, "R2_ACCOUNT_ID" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET">;
const R2_VARIABLES = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

/** The store to use, or null when there is none. `env`, `production` and `localDir` are for the tests. */
export function mediaStore(env: R2Env = serverEnv(), production: boolean = process.env.NODE_ENV === "production", localDir?: string): MediaStore | null {
  const missing = R2_VARIABLES.filter((name) => !env[name]);
  if (missing.length === 0) return r2Store({ accountId: env.R2_ACCOUNT_ID!, accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, bucket: env.R2_BUCKET! });
  if (missing.length < R2_VARIABLES.length) {
    console.error(`[media] R2 is only partly configured, not set: ${missing.join(", ")}`);
    return null;
  }
  return production ? null : localStore(localDir);
}
