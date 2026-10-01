import { useId, type InputHTMLAttributes, type ReactNode } from "react";

/**
 * A radio or checkbox inside its pill / row label. Its accessible name is set explicitly with aria-labelledby (the
 * visible text only, not a hint next to it), and `hint` is its description, so no assistive technology falls back to
 * the input's value ("on").
 */
export function Choice({
  label,
  hint,
  hintClassName,
  labelClassName,
  className,
  children,
  ...input
}: { label: ReactNode; hint?: ReactNode; hintClassName?: string; labelClassName?: string; className: string; children?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "children">) {
  const id = useId();
  return (
    <label className={className}>
      <input {...input} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint ? (
        <span>
          <strong id={`${id}-label`} className={labelClassName}>
            {label}
          </strong>
          <span id={`${id}-hint`} className={hintClassName}>
            {hint}
          </span>
        </span>
      ) : (
        <span id={`${id}-label`} className={labelClassName}>
          {label}
        </span>
      )}
      {children}
    </label>
  );
}
