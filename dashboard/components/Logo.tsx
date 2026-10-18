// Blade A — built to the guideline construction on a 64×64 grid:
// apex 6, baseline 58, stem width 14; crossbar capsule 20×9, radius 4.5,
// centred on x=32 at 55% of the height. Below 24px the crossbar grows to 22×11.

export function BladeMark({ size = 24, knockout = false, className }: { size?: number; knockout?: boolean; className?: string }) {
  const small = size < 24;
  const bw = small ? 22 : 20;
  const bh = small ? 11 : 9;
  const cy = 64 * 0.55;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="AdMate">
      <path d="M6 58 L25 6 L39 6 L58 58 L44 58 L32 25.2 L20 58 Z" fill={knockout ? "currentColor" : "var(--violet)"} />
      <rect x={32 - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={bh / 2} fill={knockout ? "currentColor" : "var(--signal)"} />
    </svg>
  );
}

// App tile: violet rounded square with the white blade and signal crossbar.
export function AppIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="AdMate">
      <rect width="64" height="64" rx="14" fill="#7F61FF" />
      <g transform="translate(12 12) scale(0.625)">
        <path d="M6 58 L25 6 L39 6 L58 58 L44 58 L32 25.2 L20 58 Z" fill="#FFFFFF" />
        <rect x="21" y="30.7" width="22" height="11" rx="5.5" fill="#C2E233" />
      </g>
    </svg>
  );
}

// Horizontal lockup: the Ad/Mate distinction is weight only (500 vs 700).
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size / 3 }}>
      <BladeMark size={size} />
      <span style={{ fontSize: size * 0.95, letterSpacing: "-0.04em", lineHeight: 1 }}>
        <span style={{ fontWeight: 500 }}>Ad</span>
        <span style={{ fontWeight: 700 }}>Mate</span>
      </span>
    </span>
  );
}
