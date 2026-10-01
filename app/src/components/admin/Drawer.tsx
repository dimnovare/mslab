"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AdminIcon } from "./AdminIcon";
import styles from "./Drawer.module.css";

/**
 * Detail panel on the right (full width on a phone), opened by a link with `?id=` so every detail has its own address.
 * A modal dialog: focus stays inside, the page behind does not scroll. Esc, the close button and a click on the
 * backdrop close it; then the address goes back to `closeHref` (the list without the id) and the focus to
 * `returnFocus` (the row's link). The dialog is closed first, so the page behind is no longer inert when it is focused.
 */
export function Drawer({
  label,
  closeHref,
  closeLabel,
  returnFocus,
  children,
}: {
  label: string;
  closeHref: string;
  closeLabel: string;
  returnFocus?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const overflow = useRef("");
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const root = document.documentElement;
    overflow.current = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow.current;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-label={label}
      data-drawer=""
      onClose={() => {
        document.documentElement.style.overflow = overflow.current;
        router.replace(closeHref, { scroll: false });
        if (returnFocus) document.getElementById(returnFocus)?.focus();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className={styles.body}>
        <button type="button" className={styles.close} aria-label={closeLabel} onClick={() => ref.current?.close()}>
          <AdminIcon name="close" size={20} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
