import { AwsClient } from "aws4fetch";
import type { MediaStore } from "./media";

// Cloudflare R2 through its S3-compatible API: signed requests (AWS Signature V4, region "auto", service "s3") to
// https://<account id>.r2.cloudflarestorage.com/<bucket>/<key>, made with aws4fetch (a small signer that needs no AWS
// SDK, and uses the platform's fetch). The credentials are an R2 API token's access key id and secret (server/env.ts:
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET). The bucket is private: /media is its only reader.

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

/**
 * R2 answered a request with a status this code does not treat as an answer (a 403 for a wrong or expired token, a 5xx).
 * The message holds the operation and the status only: never the address (it names the account and bucket), the key or
 * anything R2 sent back. server/log.ts also reads `status`.
 */
export class R2Error extends Error {
  constructor(
    readonly op: "put" | "get",
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
 * The image store on R2. `fetchImpl` is the platform's fetch (it is looked up at each call); tests pass a fake that
 * records the signed request.
 */
export function r2Store(config: R2Config, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): MediaStore {
  const client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto" });
  const urlOf = (key: string) => `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  // aws4fetch's own fetch() would retry up to 10 times with growing pauses, far longer than a request may take here: it
  // only signs, and one attempt is made.
  async function send(key: string, init: RequestInit): Promise<Response> {
    const signed = await client.sign(urlOf(key), init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANSWER_TIMEOUT_MS);
    try {
      return await fetchImpl(signed, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async put(key, bytes, contentType) {
      // aws4fetch signs an S3 request without its body ("UNSIGNED-PAYLOAD") unless it is given the hash; with it the
      // signature covers the bytes, and R2 refuses an upload whose bytes do not match.
      const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
      const res = await send(key, { method: "PUT", body: bytes, headers: { "content-type": contentType, "x-amz-content-sha256": sha256 } });
      await res.body?.cancel();
      if (!res.ok) throw new R2Error("put", res.status);
    },

    async get(key) {
      const res = await send(key, { method: "GET" });
      if (res.ok) return { body: res.body ?? new ArrayBuffer(0), contentType: res.headers.get("content-type"), etag: res.headers.get("etag") };
      await res.body?.cancel();
      if (res.status === 404) return null; // NoSuchKey
      throw new R2Error("get", res.status);
    },
  };
}
