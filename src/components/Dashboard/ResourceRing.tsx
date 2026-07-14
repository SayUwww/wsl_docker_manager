interface ResourceRingProps {
  value: number;
  label: string;
  color: string;
  size?: number;
  strokeWidth?: number;
}

export default function ResourceRing({
  value,
  label,
  color,
  size = 120,
  strokeWidth = 10,
}: ResourceRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            className="resource-ring-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--resource-ring-track)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold tracking-tight" style={{ color }}>
            {clampedValue}%
          </span>
        </div>
      </div>
      <span className="text-xs font-medium text-zinc-400">{label}</span>
    </div>
  );
}
