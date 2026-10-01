"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import type { EditResult } from "@/server/admin-content";
import { moveCourseInList } from "@/server/actions/admin-content";
import ui from "./ui.module.css";
import styles from "./editor.module.css";

/**
 * ↑ / ↓ of one course in the list: the public order (home, catalogue). The buttons keep the focus while the list
 * reorders (aria-disabled at the ends and while saving, never disabled); a failure is said next to them.
 */
export function CourseOrder({ id, name, first, last }: { id: number; name: string; first: boolean; last: boolean }) {
  const t = adminEt.courses;
  const [state, action, pending] = useActionState<EditResult | null, FormData>(moveCourseInList, null);
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const moved = useRef<"up" | "down" | null>(null);
  // the row moves in the list (its DOM node may be re-inserted, which drops the focus): the pressed button gets it back
  useEffect(() => {
    if (!state?.ok || !moved.current) return;
    (moved.current === "up" ? up : down).current?.focus();
    moved.current = null;
  }, [state]);
  const go = (dir: "up" | "down") => {
    if (pending || (dir === "up" && first) || (dir === "down" && last)) return;
    moved.current = dir;
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("dir", dir);
    startTransition(() => action(fd));
  };
  return (
    <span className={styles.tools} data-course-order={id}>
      <button ref={up} type="button" className={styles.iconBtn} aria-label={fill(t.moveUp, { name })} aria-disabled={first || pending || undefined} onClick={() => go("up")}>
        ↑
      </button>
      <button ref={down} type="button" className={styles.iconBtn} aria-label={fill(t.moveDown, { name })} aria-disabled={last || pending || undefined} onClick={() => go("down")}>
        ↓
      </button>
      {state && !state.ok && (
        <span role="alert" className={`${ui.error} ${ui.small}`}>
          {t.moveError}
        </span>
      )}
    </span>
  );
}
