"use client";

import { useActionState } from "react";
import type { AdminResult } from "@/server/admin";
import { toggleRequestHandled } from "@/server/actions/admin";
import ui from "./ui.module.css";

/**
 * "Märgi tehtuks" / "Märgi tegemata" of one request. On success the page is refreshed (the card moves and its tag
 * changes); a failure is said next to the button instead of being swallowed.
 */
export function RequestToggle({
  id,
  handled,
  t,
}: {
  id: number;
  handled: boolean;
  t: { markDone: string; markOpen: string; saving: string; error: string };
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(toggleRequestHandled, null);
  return (
    <form action={action} data-request-toggle="">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="handled" value={handled ? "0" : "1"} />
      <button
        type="submit"
        className={`${ui.btn} ${ui.smallBtn} ${handled ? ui.secondary : ""}`}
        aria-disabled={pending || undefined}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        {pending ? t.saving : handled ? t.markOpen : t.markDone}
      </button>
      <p role="status" className={ui.error}>
        {state && !state.ok ? t.error : ""}
      </p>
    </form>
  );
}
