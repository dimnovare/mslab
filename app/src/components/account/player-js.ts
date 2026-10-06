// The Player.js protocol (github.com/embedly/player.js SPEC.rst), which Bunny's iframe player speaks (bunny.net/docs/stream/playback-api):
// messages are JSON strings with context "player.js". The player posts "ready" by itself, at load; every other event comes only
// after the page asks for it with addEventListener. These few lines replace the playerjs script: no new dependency, and no
// third-party script on the student's page.

export const PLAYERJS_CONTEXT = "player.js";
export const PLAYERJS_VERSION = "0.0.11";
/** The events the lesson page asks for. */
export const PLAYER_EVENTS = ["timeupdate", "pause", "ended"] as const;

export type PlayerMessage = { event: string; value: unknown };

/** The Player.js event in a message's data (a JSON string, or an object), or null for anything else. */
export function readPlayerMessage(data: unknown): PlayerMessage | null {
  let message: unknown = data;
  if (typeof data === "string") {
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof message !== "object" || message === null) return null;
  const { context, event, value } = message as { context?: unknown; event?: unknown; value?: unknown };
  return context === PLAYERJS_CONTEXT && typeof event === "string" ? { event, value } : null;
}

/** A command for the iframe, as the protocol sends it (a JSON string). */
export function playerCommand(method: string, value?: unknown, listener?: string): string {
  return JSON.stringify({ context: PLAYERJS_CONTEXT, version: PLAYERJS_VERSION, method, ...(value === undefined ? {} : { value }), ...(listener ? { listener } : {}) });
}

/** The seconds a timeupdate reports (`{ seconds, duration }`; some players send numbers as strings), or null. */
export function secondsOf(value: unknown): number | null {
  const s = (value as { seconds?: unknown } | null)?.seconds;
  const n = typeof s === "number" ? s : typeof s === "string" ? Number(s) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
