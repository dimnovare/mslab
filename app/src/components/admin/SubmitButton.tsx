"use client";

import { useFormStatus } from "react-dom";

/** Submit button of a plain server-action form: shows `pending` while the form is being saved (aria-disabled keeps the focus). */
export function SubmitButton({ className, label, pending: pendingLabel }: { className?: string; label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      aria-disabled={pending || undefined}
      onClick={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
