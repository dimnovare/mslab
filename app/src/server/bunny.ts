import { serverEnv, type ServerEnv } from "./env";
import { sha256 } from "./token";

// Bunny Stream, the lesson videos' host (spec 3a section 2): one video library. Maria's browser uploads straight to it with tus;
// students watch in its iframe player through a signed embed URL. Configuration, the two signatures and a small client of its REST
// API; no database. bunny.net/docs (checked 05.10.2026):
// - API: https://video.bunnycdn.com/library/{libraryId}/videos[/{videoId}], header AccessKey (reference/video_createvideo,
//   video_getvideo, video_deletevideo);
// - tus: https://video.bunnycdn.com/tusupload; AuthorizationSignature = sha256(libraryId + apiKey + expires + videoId), checked on
//   every request (reference/tus-resumable-uploads);
// - embed: https://player.mediadelivery.net/embed/{libraryId}/{videoId}?token=sha256(tokenKey + videoId + expires)&expires=…
//   (stream/token-authentication; iframe.mediadelivery.net is the deprecated player); autoplay defaults to on, `t` starts at a
//   second (stream/player).

export type BunnyConfig = {
  libraryId: string;
  apiKey: string;
  tokenKey: string;
  /** The webhook URL's query secret; null: the webhook is taken without one (it only triggers a status read from the API). */
  webhookSecret: string | null;
  apiBase: string;
  tusEndpoint: string;
  embedBase: string;
};

export type BunnyEnv = Partial<Pick<ServerEnv, "BUNNY_LIBRARY_ID" | "BUNNY_API_KEY" | "BUNNY_TOKEN_KEY" | "BUNNY_WEBHOOK_SECRET" | "BUNNY_FAKE_URL">>;

const API = "https://video.bunnycdn.com";
const PLAYER = "https://player.mediadelivery.net/embed";

/**
 * The library, or null when the three settings are not all there (the admin's video field says "Video seadistamata", students see
 * "Video lisandub peagi"). BUNNY_FAKE_URL points the API, tus and the player at the e2e run's fake (tests/e2e/fake-bunny.ts); never
 * on Vercel (VERCEL is set there, build and runtime), whatever the project's variables say.
 */
export function bunnyConfig(env: BunnyEnv = serverEnv(), onVercel: boolean = Boolean(process.env.VERCEL)): BunnyConfig | null {
  if (!env.BUNNY_LIBRARY_ID || !env.BUNNY_API_KEY || !env.BUNNY_TOKEN_KEY) return null;
  const fake = !onVercel && env.BUNNY_FAKE_URL ? env.BUNNY_FAKE_URL.replace(/\/+$/, "") : null;
  return {
    libraryId: env.BUNNY_LIBRARY_ID,
    apiKey: env.BUNNY_API_KEY,
    tokenKey: env.BUNNY_TOKEN_KEY,
    webhookSecret: env.BUNNY_WEBHOOK_SECRET ?? null,
    apiBase: fake ?? API,
    tusEndpoint: `${fake ?? API}/tusupload`,
    embedBase: fake ? `${fake}/embed` : PLAYER,
  };
}

/** How long a signed embed URL plays (spec 5: about 4 hours). */
export const EMBED_TTL_SEC = 4 * 3600;
/** How long one tus upload may go on (Bunny checks the expiry on every request and advises an hour at least). */
export const UPLOAD_TTL_SEC = 6 * 3600;

export const tusSignature = (libraryId: string, apiKey: string, expires: number, videoId: string): Promise<string> => sha256(`${libraryId}${apiKey}${expires}${videoId}`);

export const embedToken = (tokenKey: string, videoId: string, expires: number): Promise<string> => sha256(`${tokenKey}${videoId}${expires}`);

/** The player's address for one video, signed until `expires` (unix seconds); autoplay off; `startSec` > 0 starts there. */
export async function signedEmbedUrl(config: BunnyConfig, videoId: string, expires: number, startSec = 0): Promise<string> {
  const query = new URLSearchParams({ token: await embedToken(config.tokenKey, videoId, expires), expires: String(expires), autoplay: "false" });
  if (startSec >= 1) query.set("t", String(Math.floor(startSec)));
  return `${config.embedBase}/${encodeURIComponent(config.libraryId)}/${encodeURIComponent(videoId)}?${query}`;
}

export type BunnyVideo = { status: number; length: number };

export type BunnyApi = {
  /** A new, empty video titled `title`; its guid. */
  createVideo(title: string): Promise<string>;
  /** Its status and length (s), or null when Bunny does not know it (404). */
  getVideo(videoId: string): Promise<BunnyVideo | null>;
  /** Deletes it; a video that is gone already (404) is fine. */
  deleteVideo(videoId: string): Promise<void>;
};

/** Bunny answered with a status the client does not take: the operation and the status only (never the URL, the key or the answer). */
export class BunnyError extends Error {
  constructor(
    readonly op: "create" | "get" | "delete",
    readonly status: number,
  ) {
    super(`Bunny ${op} answered ${status}`);
    this.name = "BunnyError";
  }
}

/** Bunny has 10 s to answer (the admin waits on create; the cron and the webhook on get and delete). */
const ANSWER_TIMEOUT_MS = 10_000;

const discard = (res: Response) => void res.body?.cancel().catch(() => {});

/** The REST client. `fetchImpl` is the platform's fetch (looked up at each call); tests pass a fake. Every call carries a signal (server/r2.ts explains why). */
export function bunnyApi(config: BunnyConfig, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): BunnyApi {
  const videos = `${config.apiBase}/library/${encodeURIComponent(config.libraryId)}/videos`;
  async function send(url: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANSWER_TIMEOUT_MS);
    try {
      return await fetchImpl(url, {
        method,
        headers: { AccessKey: config.apiKey, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async createVideo(title) {
      const res = await send(videos, "POST", { title });
      if (!res.ok) {
        discard(res);
        throw new BunnyError("create", res.status);
      }
      const json = (await res.json().catch(() => null)) as { guid?: unknown } | null;
      if (typeof json?.guid !== "string" || !json.guid) throw new BunnyError("create", res.status);
      return json.guid;
    },
    async getVideo(videoId) {
      const res = await send(`${videos}/${encodeURIComponent(videoId)}`, "GET");
      if (res.status === 404) {
        discard(res);
        return null;
      }
      if (!res.ok) {
        discard(res);
        throw new BunnyError("get", res.status);
      }
      const json = (await res.json().catch(() => null)) as { status?: unknown; length?: unknown } | null;
      return { status: typeof json?.status === "number" ? json.status : -1, length: typeof json?.length === "number" ? json.length : 0 };
    },
    async deleteVideo(videoId) {
      const res = await send(`${videos}/${encodeURIComponent(videoId)}`, "DELETE");
      discard(res);
      if (!res.ok && res.status !== 404) throw new BunnyError("delete", res.status);
    },
  };
}

export type BunnyVideoStatus = "uploading" | "processing" | "ready" | "failed";

/**
 * A lesson's video state from Bunny's video status (video_getvideo): 4 Finished → ready; 5 Error, 6 UploadFailed → failed;
 * 0 Created → still uploading; 1 Uploaded, 2 Processing, 3 Transcoding, 7–8 (JIT) and anything new → processing. Only 4 counts as
 * ready (3 may already play some resolutions; waiting for 4 is the safe side).
 */
export function lessonVideoStatus(bunnyStatus: number): BunnyVideoStatus {
  if (bunnyStatus === 4) return "ready";
  if (bunnyStatus === 5 || bunnyStatus === 6) return "failed";
  return bunnyStatus === 0 ? "uploading" : "processing";
}
