// Line icons from prototype B (24px grid, 1.4 stroke), drawn in currentColor.
const PATHS = {
  arrow: ["M4 12h15m-6-6 6 6-6 6"],
  bag: ["M5 7h14l1 14H4L5 7Z", "M8 8V6a4 4 0 0 1 8 0v2"],
  menu: ["M4 8h16M4 16h16"],
  close: ["m6 6 12 12M6 18 18 6"],
  up: ["M6 18 18 6M6 6h12v12"],
  chevronLeft: ["m15 5-7 7 7 7"],
  chevronRight: ["m9 5 7 7-7 7"],
  flower: ["M12 12C-2 9 7-5 12 9c5-14 14 0 0 3 14 3 5 17 0 3-5 14-14 0 0-3Z"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3 2"],
  check: ["m5 12 4 4L19 6"],
  heart: ["M12 20s-7.5-4.6-7.5-10.2A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z"],
  lock: ["M6.5 11h11v9h-11z", "M9 11V8a3 3 0 0 1 6 0v3"],
  search: ["M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z", "m20 20-4.4-4.4"],
  pin: ["M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z", "M12 7.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"],
} as const;

export type IconName = keyof typeof PATHS;

/** `filled` paints the shape in currentColor too (the pressed favourite heart). */
export function Icon({ name, size = 19, className, filled }: { name: IconName; size?: number; className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
