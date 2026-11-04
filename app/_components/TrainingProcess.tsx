"use client";

import { Check, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import ProgressBar from "./ProgressBar";

export type Stage = "load" | "shrink" | "numbers" | "split" | "round" | "save";

export type ProcessState = {
  stage: Stage | null; // the stage running now (null = not started)
  finished: boolean; // all stages done
  load: { done: number; total: number };
  shrink: { done: number; total: number };
  numbers: { done: number; total: number };
  photo: {
    url: string;
    pixels: HTMLCanvasElement;
    mirror: HTMLCanvasElement;
    numbers: Float32Array;
  } | null;
  split: { train: number; heldOut: number } | null;
  round: { round: number; accuracy: number } | null;
};

export const emptyProcess = (): ProcessState => ({
  stage: null,
  finished: false,
  load: { done: 0, total: 0 },
  shrink: { done: 0, total: 0 },
  numbers: { done: 0, total: 0 },
  photo: null,
  split: null,
  round: null,
});

const ORDER: Stage[] = ["load", "shrink", "numbers", "split", "round", "save"];

type TrainingProcessProps = {
  state: ProcessState;
  rounds: number;
  keepLearning: boolean;
};

export default function TrainingProcess({ state, rounds, keepLearning }: TrainingProcessProps) {
  const now = state.stage ? ORDER.indexOf(state.stage) : -1;
  const status = (s: Stage) => {
    const i = ORDER.indexOf(s);
    if (state.finished || i < now) return "done";
    return i === now ? "running" : "waiting";
  };
  const count = (c: { done: number; total: number }) => (c.total ? `${c.done} / ${c.total}` : "");

  const share = (c: { done: number; total: number }) => (c.total ? c.done / c.total : 0);

  const rows: { stage: Stage; title: string; detail: string; progress?: number }[] = [
    { stage: "load", title: "Load your photos", detail: count(state.load), progress: share(state.load) },
    {
      stage: "shrink",
      title: "Shrink each to 224 × 224 pixels",
      detail: count(state.shrink),
      progress: share(state.shrink),
    },
    {
      stage: "numbers",
      title: "MobileNet turns pixels into 1,280 numbers",
      detail: count(state.numbers),
      progress: share(state.numbers),
    },
    {
      stage: "split",
      title: "Keep about 1 in 5 aside to test fairly",
      detail: state.split ? `${state.split.train} to learn, ${state.split.heldOut} to test` : "",
    },
    {
      stage: "round",
      title: keepLearning ? "Keep learning from the saved model" : "Learn from zero",
      detail: state.round
        ? `round ${state.round.round} / ${rounds}, ${Math.round(state.round.accuracy * 100)}% right`
        : "",
      progress: state.round ? state.round.round / rounds : 0,
    },
    { stage: "save", title: "Save in this browser", detail: state.finished ? "saved" : "" },
  ];

  return (
    <ol className="grid gap-2 rounded-xl border-2 border-line bg-card px-4 py-3.5" aria-label="Training steps">
      {rows.map((r, i) => {
        const st = status(r.stage);
        return (
          <li key={r.stage} className="grid gap-2">
            <div className="flex items-center gap-3">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-[14px] font-bold ${
                  st === "done"
                    ? "bg-green-soft text-green"
                    : st === "running"
                      ? "bg-blue-soft text-blue"
                      : "bg-page text-muted"
                }`}
              >
                {st === "done" ? (
                  <Check size={16} aria-label="done" />
                ) : st === "running" ? (
                  <Loader2 size={16} className="animate-spin" aria-label="running" />
                ) : (
                  i + 1
                )}
              </span>
              <span className={`flex-1 ${st === "waiting" ? "text-muted" : ""}`}>{r.title}</span>
              {r.detail && (
                <span className="text-[14px] whitespace-nowrap text-muted tabular-nums">{r.detail}</span>
              )}
            </div>
            {st === "running" && r.progress !== undefined && (
              <div className="ml-10">
                <ProgressBar value={Math.round(r.progress * 100)} label={`${r.title} progress`} />
              </div>
            )}
            {r.stage === "numbers" && state.photo && <PhotoToNumbers photo={state.photo} />}
          </li>
        );
      })}
    </ol>
  );
}

// The photo MobileNet is looking at right now: photo → 224 px → mirror → its numbers.
function PhotoToNumbers({ photo }: { photo: NonNullable<ProcessState["photo"]> }) {
  const arrow = <span className="text-muted" aria-hidden>→</span>;
  let biggest = 0;
  let zeros = 0;
  for (const n of photo.numbers) {
    if (n > biggest) biggest = n;
    if (n === 0) zeros++;
  }
  return (
    <div className="ml-10 grid gap-2 rounded-xl bg-page p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Picture caption="your photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage link */}
          <img src={photo.url} alt="Photo being read" className="size-20 rounded-lg object-cover" />
        </Picture>
        {arrow}
        <Picture caption="224 × 224 px">
          <CanvasCopy source={photo.pixels} label="The photo shrunk to 224 by 224 pixels" />
        </Picture>
        {arrow}
        <Picture caption="mirror copy">
          <CanvasCopy source={photo.mirror} label="The same photo flipped" />
        </Picture>
      </div>
      <div className="grid gap-1">
        <NumberStrip numbers={photo.numbers} />
        <span className="text-[13px] text-muted">
          1,280 numbers, one bar each. Taller bar = MobileNet sees more of that pattern. Biggest:{" "}
          {biggest.toFixed(2)}, and {zeros} are 0 (pattern not in this photo).
        </span>
      </div>
    </div>
  );
}

function Picture({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="grid justify-items-center gap-1">
      {children}
      <figcaption className="text-[12px] text-muted">{caption}</figcaption>
    </figure>
  );
}

// Shows a copy of a canvas that train() made (it is not in the page otherwise).
function CanvasCopy({ source, label }: { source: HTMLCanvasElement; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = source.width;
    c.height = source.height;
    c.getContext("2d")?.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} role="img" aria-label={label} className="size-20 rounded-lg" style={{ imageRendering: "pixelated" }} />;
}

// One thin bar per number, drawn as a single SVG path so 1,280 bars stay fast.
function NumberStrip({ numbers }: { numbers: Float32Array }) {
  const H = 40;
  let max = 0;
  for (const n of numbers) if (n > max) max = n;
  let d = "";
  numbers.forEach((n, i) => {
    const h = max > 0 ? (Math.max(n, 0) / max) * H : 0;
    if (h > 0.2) d += `M${i} ${H}V${(H - h).toFixed(1)}h1V${H}Z`;
  });
  return (
    <svg
      viewBox={`0 0 ${numbers.length} ${H}`}
      preserveAspectRatio="none"
      className="h-10 w-full rounded bg-card"
      role="img"
      aria-label={`${numbers.length} numbers MobileNet made from this photo`}
    >
      <path d={d} className="fill-blue" />
    </svg>
  );
}
