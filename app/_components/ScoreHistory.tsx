export type RunPoint = {
  id: string;
  photos: number; // labeled photos the run used
  heldOut: number; // photos it never saw, which the score is measured on
  accuracy: number; // 0 to 1, on those never-seen photos
};

const GOAL = 0.85;

// Plot area inside the 400 × 220 viewBox.
const LEFT = 44;
const RIGHT = 388;
const TOP = 12;
const BOTTOM = 178;

// Never-seen accuracy of every training run, against how many photos it learned from.
// More photos should push the dots up. The dashed line is the goal.
export default function ScoreHistory({ runs }: { runs: RunPoint[] }) {
  if (runs.length === 0) return null;

  const maxPhotos = Math.max(...runs.map((r) => r.photos));
  const xMax = Math.max(300, Math.ceil((maxPhotos * 1.25) / 100) * 100);
  const x = (n: number) => LEFT + (n / xMax) * (RIGHT - LEFT);
  const y = (v: number) => BOTTOM - Math.min(Math.max(v, 0), 1) * (BOTTOM - TOP);
  const ticks = [0, Math.round(xMax / 2), xMax];

  const last = runs[runs.length - 1];
  const gap = Math.round((GOAL - last.accuracy) * 100);
  // One photo is this many points of the score, so a few points of change can be luck.
  const step = Math.round(100 / last.heldOut);

  return (
    <section className="grid gap-2" aria-label="Score and photos">
      <h3 className="text-center text-[18px]">Does it improve with more photos?</h3>
      <svg
        viewBox="0 0 400 220"
        className="mx-auto h-auto w-full max-w-[560px]"
        role="img"
        aria-label={`Latest run: ${Math.round(last.accuracy * 100)}% right on photos it never saw, after learning from ${last.photos} photos. The goal is ${Math.round(GOAL * 100)}%.`}
      >
        <g className="stroke-line">
          {[0, 0.5, 1].map((v) => (
            <line key={v} x1={LEFT} x2={RIGHT} y1={y(v)} y2={y(v)} />
          ))}
        </g>
        <g className="fill-muted text-xs" textAnchor="end">
          {[0, 0.5, 1].map((v) => (
            <text key={v} x={LEFT - 8} y={y(v) + 4}>
              {Math.round(v * 100)}%
            </text>
          ))}
        </g>
        <g className="fill-muted text-xs">
          {ticks.map((t, i) => (
            <text key={t} x={x(t)} y={198} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>
              {t} photos
            </text>
          ))}
        </g>
        <line
          x1={LEFT}
          x2={RIGHT}
          y1={y(GOAL)}
          y2={y(GOAL)}
          className="stroke-green"
          strokeWidth="2"
          strokeDasharray="6 5"
        />
        <text x={RIGHT} y={y(GOAL) - 5} textAnchor="end" className="fill-green text-xs font-bold">
          goal {Math.round(GOAL * 100)}%
        </text>
        {runs.length > 1 && (
          <polyline
            points={runs.map((r) => `${x(r.photos).toFixed(1)},${y(r.accuracy).toFixed(1)}`).join(" ")}
            fill="none"
            className="stroke-line"
            strokeWidth="2"
          />
        )}
        {runs.map((r, i) => (
          <circle
            key={r.id}
            cx={x(r.photos)}
            cy={y(r.accuracy)}
            r={i === runs.length - 1 ? 6 : 4}
            className={i === runs.length - 1 ? "fill-blue" : "fill-muted"}
          />
        ))}
      </svg>
      <p className="text-center text-[15px]">
        Latest: <b>{Math.round(last.accuracy * 100)}%</b> on {last.heldOut} photos it never saw, after
        learning from {last.photos} photos.{" "}
        {gap > 0 ? `${gap} ${gap === 1 ? "point" : "points"} to the goal.` : "That reaches the goal."}
      </p>
      <p className="text-center text-[13px] text-muted">
        Each dot is one training run. Each never-seen photo is worth {step} {step === 1 ? "point" : "points"} of the score, so a few
        points of change can be luck. Trust the direction of many dots, not one. Add more photos, train
        again, and watch the dots.
      </p>
    </section>
  );
}
