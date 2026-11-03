export default function AccuracyChart() {
  return (
    <svg
      viewBox="0 0 400 200"
      className="h-auto w-full"
      role="img"
      aria-label="Accuracy line rising from 50% to 82% over 6 rounds"
    >
      <g className="stroke-line">
        <line x1="44" x2="388" y1="158" y2="158" />
        <line x1="44" x2="388" y1="85" y2="85" />
        <line x1="44" x2="388" y1="12" y2="12" />
      </g>
      <g className="fill-muted text-xs" textAnchor="end">
        <text x="36" y="162">
          0%
        </text>
        <text x="36" y="89">
          50%
        </text>
        <text x="36" y="16">
          100%
        </text>
      </g>
      <g className="fill-muted text-xs" textAnchor="middle">
        <text x="44" y="192">
          round 1
        </text>
        <text x="197" y="192">
          round 5
        </text>
        <text x="388" y="192">
          round 10
        </text>
      </g>
      <path
        d="M44 72 L82 60 L120 49 L159 42 L197 36 L235 32"
        fill="none"
        className="stroke-blue"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="235" cy="32" r="5" className="fill-blue" />
    </svg>
  );
}
