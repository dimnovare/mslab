// Line icons from prototype B (24px grid, 1.4 stroke), drawn in currentColor.
const PATHS = {
  arrow: ["M4 12h15m-6-6 6 6-6 6"],
  bag: ["M5 7h14l1 14H4L5 7Z", "M8 8V6a4 4 0 0 1 8 0v2"],
  menu: ["M4 8h16M4 16h16"],
  close: ["m6 6 12 12M6 18 18 6"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 19, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
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
