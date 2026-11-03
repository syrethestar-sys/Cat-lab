type AccuracyChartProps = {
  values: number[]; // accuracy per finished round, 0 to 1
  rounds: number; // total rounds, sets the x axis
};

// Plot area inside the 400 × 200 viewBox.
const LEFT = 44;
const RIGHT = 388;
const TOP = 12;
const BOTTOM = 158;

export default function AccuracyChart({ values, rounds }: AccuracyChartProps) {
  const x = (round: number) =>
    LEFT + ((round - 1) / Math.max(rounds - 1, 1)) * (RIGHT - LEFT);
  const y = (v: number) => BOTTOM - Math.min(Math.max(v, 0), 1) * (BOTTOM - TOP);

  const points = values.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values.at(-1);
  const mid = Math.round((rounds + 1) / 2);

  return (
    <svg
      viewBox="0 0 400 200"
      className="mx-auto h-auto w-full max-w-[560px]"
      role="img"
      aria-label={
        last === undefined
          ? "Accuracy chart, waiting for the first round"
          : `Accuracy after round ${values.length} is ${Math.round(last * 100)}%`
      }
    >
      <g className="stroke-line">
        {[BOTTOM, (BOTTOM + TOP) / 2, TOP].map((gy) => (
          <line key={gy} x1={LEFT} x2={RIGHT} y1={gy} y2={gy} />
        ))}
      </g>
      <g className="fill-muted text-xs" textAnchor="end">
        <text x={LEFT - 8} y={BOTTOM + 4}>
          0%
        </text>
        <text x={LEFT - 8} y={(BOTTOM + TOP) / 2 + 4}>
          50%
        </text>
        <text x={LEFT - 8} y={TOP + 4}>
          100%
        </text>
      </g>
      <g className="fill-muted text-xs">
        <text x={x(1)} y={192} textAnchor="start">
          round 1
        </text>
        <text x={x(mid)} y={192} textAnchor="middle">
          round {mid}
        </text>
        <text x={x(rounds)} y={192} textAnchor="end">
          round {rounds}
        </text>
      </g>
      {points.length > 1 && (
        <polyline
          points={points.join(" ")}
          fill="none"
          className="stroke-blue"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {last !== undefined && (
        <circle
          cx={x(values.length)}
          cy={y(last)}
          r="5"
          className="fill-blue"
        />
      )}
    </svg>
  );
}
