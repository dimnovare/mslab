"use client";

import { useId, useRef, useState } from "react";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import ui from "./ui.module.css";
import styles from "./editor.module.css";

/** The longest side of an uploaded image (spec: ≤ 2400 px). */
export const MAX_EDGE = 2400;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
/** The server's limit; checked here too so a hopeless upload is not sent. */
const MAX_BYTES = 8 * 1024 * 1024;
/** Larger originals are not even opened (a phone photo is 3–12 MB). */
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const QUALITY = 0.86;

type Problem = "type" | "size" | "decode" | "session" | "server";
class UploadProblem extends Error {
  constructor(readonly problem: Problem) {
    super(problem);
  }
}

/**
 * Draws the image on a canvas at most MAX_EDGE px on its longest side and encodes it again: JPEG stays JPEG, PNG and
 * WebP become WebP (transparency kept; a browser that cannot write WebP gives PNG). A canvas holds pixels only, so the
 * new file has no EXIF data (camera, GPS position) or other metadata. createImageBitmap applies the EXIF orientation
 * first, so portrait photos stay upright.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!ACCEPT.includes(file.type)) throw new UploadProblem("type");
  if (file.size > MAX_SOURCE_BYTES) throw new UploadProblem("size");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UploadProblem("decode");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new UploadProblem("decode");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const wanted = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, wanted, QUALITY));
  if (!blob) throw new UploadProblem("decode");
  const type = ACCEPT.includes(blob.type) ? blob.type : "image/png";
  if (blob.size > MAX_BYTES) throw new UploadProblem("size");
  const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  // a neutral name: the visitor's file name (often a date, a person's name) is not sent
  return new File([blob], `pilt.${ext}`, { type });
}

/** Sends one prepared image to /api/admin/upload; its R2 key. */
async function send(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  let res: Response;
  try {
    res = await fetch("/api/admin/upload", { method: "POST", body, credentials: "same-origin" });
  } catch {
    throw new UploadProblem("server");
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; key?: string; error?: string } | null;
  if (res.ok && json?.ok && typeof json.key === "string") return json.key;
  if (res.status === 401) throw new UploadProblem("session");
  if (res.status === 413) throw new UploadProblem("size");
  if (res.status === 415) throw new UploadProblem("type");
  throw new UploadProblem("server");
}

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

/**
 * "Lisa pilte": picks images, makes each smaller and metadata-free in the browser (shrinkImage) and uploads it; the
 * keys of the stored images go to `onUploaded` in the order picked. The server checks type, size and content again.
 */
export function ImageUpload({ onUploaded, multiple = false, label }: { onUploaded: (keys: string[]) => void; multiple?: boolean; label?: string }) {
  const t = adminEt.upload;
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";

  const pick = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    const keys: string[] = [];
    try {
      for (const [i, file] of files.entries()) {
        setStatus({ kind: "busy", text: files.length > 1 ? fill(t.uploading, { n: i + 1, total: files.length }) : t.preparing });
        const small = await shrinkImage(file);
        if (files.length === 1) setStatus({ kind: "busy", text: fill(t.uploading, { n: 1, total: 1 }) });
        keys.push(await send(small));
      }
      setStatus({ kind: "done", text: keys.length === 1 ? t.doneOne : fill(t.doneMany, { n: keys.length }) });
    } catch (e) {
      setStatus({ kind: "error", text: t[e instanceof UploadProblem ? e.problem : "server"] });
    } finally {
      if (keys.length) onUploaded(keys);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={styles.upload} data-image-upload="" aria-busy={busy || undefined}>
      <input
        ref={input}
        id={`${uid}-file`}
        type="file"
        accept={ACCEPT.join(",")}
        multiple={multiple}
        aria-describedby={`${uid}-hint ${uid}-status`}
        onChange={(e) => void pick(Array.from(e.target.files ?? []))}
      />
      <label htmlFor={`${uid}-file`} className={`${ui.btn} ${ui.secondary} ${ui.smallBtn}`} aria-disabled={busy || undefined}>
        {label ?? (multiple ? t.choose : t.chooseOne)}
      </label>
      <p id={`${uid}-hint`} className={`${ui.muted} ${styles.uploadHint}`}>
        {t.hint}
      </p>
      <p id={`${uid}-status`} role="status" className={status.kind === "error" ? ui.error : status.kind === "done" ? ui.success : ui.hint} data-upload-status={status.kind}>
        {status.kind === "idle" ? "" : status.text}
      </p>
    </div>
  );
}
