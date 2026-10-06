import { AwsV4Signer } from "aws4fetch";
import type { FileStore } from "./media";

// Cloudflare R2 through its S3-compatible API: signed requests (AWS Signature V4, region "auto", service "s3") to
// https://<account id>.r2.cloudflarestorage.com/<bucket>/<key>, made with aws4fetch (a small signer that needs no AWS
// SDK, and uses the platform's fetch). The credentials are an R2 API token's access key id and secret (server/env.ts:
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET). The bucket is private: /media (img/ keys) and the signed
// addresses of the lesson files (lessons/ keys, server/lesson-files.ts) are its only readers.

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

/**
 * R2 answered a request with a status this code does not treat as an answer (a 403 for a wrong or expired token, a 5xx).
 * The message holds the operation and the status only: never the address (it names the account and bucket), the key or
 * anything R2 sent back. server/log.ts also reads `status`.
 */
export class R2Error extends Error {
  constructor(
    readonly op: "put" | "get" | "delete",
    readonly status: number,
  ) {
    super(`R2 ${op} answered ${status}`);
    this.name = "R2Error";
  }
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** How long R2 has to start answering; a body that is being streamed on to a visitor is not cut off by it. */
const ANSWER_TIMEOUT_MS = 10_000;

/**
 * The signing keys, as aws4fetch's AwsClient keeps them: one entry per secret, day, region and service. They live here
 * and not in r2Store because mediaStore() makes a new store for every request: a function instance derives the day's key
 * (four HMACs) once, not once a request. Emptied when it has grown past a few days' worth, so it never piles up.
 */
const signingKeys = new Map<string, ArrayBuffer>();
const MAX_SIGNING_KEYS = 8;

/**
 * Lets go of a body nobody reads (R2's answer to a PUT, its XML error). Not awaited: cancelling a body that is one branch
 * of a tee waits for the other branch, which may never come, and the answer to the visitor must not wait for that.
 */
function discard(res: Response): void {
  res.body?.cancel().catch(() => {});
}

/**
 * The file store on R2: the images and the lesson files. `fetchImpl` is the platform's fetch (it is looked up at each call);
 * tests pass a fake that records the signed request.
 */
export function r2Store(config: R2Config, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): FileStore {
  const urlOf = (key: string) => `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  // Only aws4fetch's signer is used: its AwsClient.fetch() would retry up to 10 times with growing pauses, far longer than
  // a request may take here, and one attempt is made.
  // The signed request goes to fetch as an address and an init that holds the signal, never as a Request object. In a
  // route handler fetch is Next.js's: it folds the init of a Request into the Request, and then deduplicates a GET whose
  // init has no signal: the caller gets one branch of a tee of the response body, and the other branch stays unread,
  // released only at garbage collection. Cancelling the caller's branch (the 404 and error answers below) waits for that
  // other branch, so it never finished and /media never answered. A signal in the init is Next.js's opt-out of that
  // deduplication. The bodies that are only thrown away are not awaited either (discard): no tee or wrapper can hold an
  // answer back again.
  async function send(key: string, init: { method: "GET" | "PUT" | "DELETE"; headers?: Record<string, string>; body?: ArrayBuffer }): Promise<Response> {
    if (signingKeys.size > MAX_SIGNING_KEYS) signingKeys.clear();
    const signer = new AwsV4Signer({ ...init, url: urlOf(key), accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto", cache: signingKeys });
    const signed = await signer.sign();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANSWER_TIMEOUT_MS);
    try {
      return await fetchImpl(signed.url.toString(), { method: signed.method, headers: signed.headers, body: signed.body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async put(key, bytes, contentType, disposition) {
      // aws4fetch signs an S3 request without its body ("UNSIGNED-PAYLOAD") unless it is given the hash; with it the
      // signature covers the bytes, and R2 refuses an upload whose bytes do not match.
      const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
      const res = await send(key, { method: "PUT", body: bytes, headers: { "content-type": contentType, "x-amz-content-sha256": sha256, ...(disposition ? { "content-disposition": disposition } : {}) } });
      discard(res);
      if (!res.ok) throw new R2Error("put", res.status);
    },

    async get(key) {
      const res = await send(key, { method: "GET" });
      if (res.ok) return { body: res.body ?? new ArrayBuffer(0), contentType: res.headers.get("content-type"), etag: res.headers.get("etag") };
      discard(res);
      if (res.status === 404) return null; // NoSuchKey
      throw new R2Error("get", res.status);
    },

    async delete(key) {
      const res = await send(key, { method: "DELETE" });
      discard(res);
      if (!res.ok && res.status !== 404) throw new R2Error("delete", res.status);
    },

    // A presigned GET (query signature, X-Amz-Expires): made here, no request. R2 answers it with the object's stored type and
    // Content-Disposition.
    async signedGetUrl(key, { expiresSec }) {
      if (signingKeys.size > MAX_SIGNING_KEYS) signingKeys.clear();
      const url = new URL(urlOf(key));
      url.searchParams.set("X-Amz-Expires", String(expiresSec));
      const signer = new AwsV4Signer({ method: "GET", url: url.toString(), accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto", signQuery: true, cache: signingKeys });
      return (await signer.sign()).url.toString();
    },
  };
}
