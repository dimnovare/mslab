"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LIMITS, moveItem, type DraftImage } from "@/domain/course-editor";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import { mediaUrl } from "@/lib/media";
import { I18nInput } from "./I18nInput";
import { ImageUpload } from "./ImageUpload";
import ui from "./ui.module.css";
import styles from "./editor.module.css";

const FINE = "(pointer: fine)";
/** Drag and drop only with a mouse or trackpad; on touch screens the ↑ / ↓ buttons are the way (no long-press drags). */
function usePointerFine(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(FINE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(FINE).matches,
    () => false,
  );
}

/** React keys for the images: the key, numbered when the same image is in the list twice. */
function rowKeys(images: DraftImage[]): string[] {
  const seen = new Map<string, number>();
  return images.map((img) => {
    const n = (seen.get(img.key) ?? 0) + 1;
    seen.set(img.key, n);
    return n === 1 ? img.key : `${img.key}#${n}`;
  });
}

/**
 * An ordered image list (course gallery): upload more, write each picture's description (ET / RU), order with ↑ / ↓
 * or by dragging (pointer devices), remove. The first image is the main one (card, start of the gallery). The order
 * is the stored `sort`.
 */
export function GalleryEditor({
  images,
  onChange,
  error,
  hint,
  showMain = true,
  errorOf,
}: {
  images: DraftImage[];
  /** Gets an update function (an upload can finish after other changes: it must add to the list as it is then). */
  onChange: (update: (images: DraftImage[]) => DraftImage[]) => void;
  error?: string;
  hint?: string;
  /** "Põhipilt" on the first image (a course: the card's picture); off for the trainer's works. */
  showMain?: boolean;
  /** One picture's own refusal (a bad key, a description too long), shown at that picture. */
  errorOf?: (index: number) => string | undefined;
}) {
  const t = adminEt.courseEditor.fields;
  const fine = usePointerFine();
  // the dragged image: a ref for the handlers (dragover follows dragstart before React has re-rendered), state for the look
  const dragFrom = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // the button that gets the focus after the next render (the moved image's arrow, the next image's ×)
  const focus = useRef<{ key: string; tool: "up" | "down" | "remove" } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const keys = rowKeys(images);

  useEffect(() => {
    const target = focus.current;
    if (!target) return;
    focus.current = null;
    root.current?.querySelector<HTMLElement>(`[data-gallery-item="${CSS.escape(target.key)}"] [data-tool="${target.tool}"]`)?.focus();
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    onChange((list) => moveItem(list, from, to));
  };
  const remove = (i: number) => {
    const rest = images.filter((_, j) => j !== i);
    onChange((list) => list.filter((_, j) => j !== i));
    const nextKey = rowKeys(rest)[Math.min(i, rest.length - 1)];
    if (nextKey) focus.current = { key: nextKey, tool: "remove" };
  };

  return (
    <div ref={root} className={styles.list} data-gallery-editor="" data-invalid={error ? "" : undefined} tabIndex={error ? -1 : undefined}>
      {hint && <p className={ui.hint}>{hint}</p>}
      {images.length === 0 ? (
        <p className={`${ui.muted} ${ui.small}`}>{t.noImages}</p>
      ) : (
        <ol className={styles.gallery}>
          {images.map((img, i) => {
            const n = i + 1;
            const key = keys[i];
            return (
              <li
                key={key}
                className={styles.shot}
                data-gallery-item={key}
                draggable={fine || undefined}
                data-dragging={dragging === i ? "" : undefined}
                data-over={over === i && dragging !== null && dragging !== i ? "" : undefined}
                onDragStart={(e) => {
                  // only a drag that starts on the picture or its frame, not on the description field
                  if ((e.target as HTMLElement).closest("input, textarea, button")) return e.preventDefault();
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", key);
                  dragFrom.current = i;
                  setDragging(i);
                }}
                onDragOver={(e) => {
                  if (dragFrom.current === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== i) setOver(i);
                }}
                onDragLeave={() => setOver((o) => (o === i ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom.current !== null) move(dragFrom.current, i);
                  dragFrom.current = null;
                  setDragging(null);
                  setOver(null);
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setDragging(null);
                  setOver(null);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a small thumbnail of an upload, no optimisation needed */}
                <img className={styles.thumb} src={mediaUrl(img.key)} alt="" draggable={false} />
                <div className={styles.shotBody}>
                  <span className={styles.shotName}>
                    {fill(t.image, { n })}
                    {showMain && i === 0 && <span className={`${ui.tag} ${ui.dark}`}>{t.main}</span>}
                  </span>
                  <I18nInput label={t.alt} value={img.alt} onChange={(alt) => onChange((list) => list.map((x, j) => (j === i ? { ...x, alt } : x)))} maxLength={LIMITS.alt} error={errorOf?.(i)} name={`image-${i}`} />
                </div>
                <span className={styles.shotTools}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    data-tool="up"
                    aria-label={fill(t.imageUp, { n })}
                    aria-disabled={i === 0 || undefined}
                    onClick={() => {
                      move(i, i - 1);
                      if (i > 0) focus.current = { key, tool: "up" };
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    data-tool="down"
                    aria-label={fill(t.imageDown, { n })}
                    aria-disabled={i === images.length - 1 || undefined}
                    onClick={() => {
                      move(i, i + 1);
                      if (i < images.length - 1) focus.current = { key, tool: "down" };
                    }}
                  >
                    ↓
                  </button>
                  <button type="button" className={styles.iconBtn} data-tool="remove" aria-label={fill(t.imageRemove, { n })} onClick={() => remove(i)}>
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className={ui.error}>{error}</p>}
      <ImageUpload multiple onUploaded={(added) => onChange((list) => [...list, ...added.map((key) => ({ key, alt: { et: "" } }))])} />
    </div>
  );
}
