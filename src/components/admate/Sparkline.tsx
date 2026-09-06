/** Tiny inline sparkline — shape only, no axis or numbers. */
export function Sparkline({
  values,
  width = 76,
  height = 22,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden="true">
        <line
          x1="2"
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2 3"
          opacity="0.4"
        />
      </svg>
    );
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const stepX = (width - 4) / (clean.length - 1);
  const points = clean
    .map((v, i) => {
      const x = 2 + i * stepX;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
