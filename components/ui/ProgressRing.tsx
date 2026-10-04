/**
 * A real-data completion ring (Today's "X of Y doses" fraction) — never a
 * decorative stand-in with nothing behind it. `currentColor` for the
 * filled arc so it can render white-on-dark-green (Today's hero) or
 * accent-on-light (anywhere else) from one component.
 */
export function ProgressRing({
  value,
  total,
  size = 56,
  strokeWidth = 5,
  label,
  labelClassName = "text-xs font-bold",
}: {
  value: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  /** Center text — defaults to a rounded percentage; pass "3/5" etc. for a fraction instead. */
  label?: string;
  labelClassName?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, value / total) : 0;
  const offset = circumference * (1 - fraction);
  const percent = Math.round(fraction * 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center tabular-nums ${labelClassName}`}>{label ?? `${percent}%`}</span>
    </div>
  );
}
