import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MediaStore } from "./media";

// The image store of local development: a folder instead of R2, so `next dev` and the e2e run need no bucket and no
// credentials. Used by server/media-store.ts when no R2 variable is set and NODE_ENV is not "production". The folder is
// git-ignored (an uploaded photo is not source); delete it any time, the images in it are only test uploads.

/**
 * app/.media-local, next to package.json (`next dev` runs in app/). The turbopackIgnore comment keeps `next build`'s file
 * tracing from packing the files of this folder (test uploads) into the server function that contains this code.
 */
export const LOCAL_MEDIA_DIR = join(/* turbopackIgnore: true */ process.cwd(), ".media-local");

/** Plain names between slashes: nothing that could climb out of the folder (no "..", no backslash, no leading slash). */
const SAFE_KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const isSafeKey = (key: string) => SAFE_KEY.test(key) && key.split("/").every((part) => part !== "." && part !== "..");

const absent = (e: unknown) => ["ENOENT", "ENOTDIR", "EISDIR"].includes((e as NodeJS.ErrnoException)?.code ?? "");

/** The store in `dir`: each object is the file <dir>/<key>, and its content type is kept next to it in <key>.type. */
export function localStore(dir: string = LOCAL_MEDIA_DIR): MediaStore {
  const pathOf = (key: string) => {
    if (!isSafeKey(key)) throw new Error("media key outside the media folder");
    return join(dir, ...key.split("/"));
  };

  return {
    async put(key, bytes, contentType) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, new Uint8Array(bytes));
      await writeFile(`${path}.type`, contentType);
    },

    async get(key) {
      const path = pathOf(key);
      let file: Buffer;
      try {
        file = await readFile(path);
      } catch (e) {
        if (absent(e)) return null;
        throw e;
      }
      const contentType = await readFile(`${path}.type`, "utf8").catch((e) => {
        if (absent(e)) return null;
        throw e;
      });
      return {
        body: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
        contentType,
        etag: `"${createHash("sha256").update(file).digest("hex").slice(0, 32)}"`,
      };
    },
  };
}
