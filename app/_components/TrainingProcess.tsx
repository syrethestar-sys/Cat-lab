"use client";

import { Check, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import type { Inside, Picture as Pic } from "../_lib/model";
import ProgressBar from "./ProgressBar";

export type Stage = "load" | "shrink" | "pixels" | "split" | "start" | "round" | "save";

export type ProcessState = {
  stage: Stage | null; // the stage running now (null = not started)
  finished: boolean; // all stages done
  load: { done: number; total: number };
  shrink: { done: number; total: number };
  pixels: { done: number; total: number };
  photo: { url: string; pixels: HTMLCanvasElement; mirror: HTMLCanvasElement } | null;
  split: { train: number; heldOut: number } | null;
  spy: HTMLCanvasElement | null; // the photo used to show what the model sees
  before: Inside | null; // inside the model before round 1
  inside: Inside | null; // inside the model after the latest round
  round: { round: number; accuracy: number } | null;
};

export const emptyProcess = (): ProcessState => ({
  stage: null,
  finished: false,
  load: { done: 0, total: 0 },
  shrink: { done: 0, total: 0 },
  pixels: { done: 0, total: 0 },
  photo: null,
  split: null,
  spy: null,
  before: null,
  inside: null,
  round: null,
});

// "start" is the first moment of the learning row, so both share one row.
const ORDER: Stage[] = ["load", "shrink", "pixels", "split", "start", "round", "save"];

type TrainingProcessProps = {
  state: ProcessState;
  rounds: number;
  keepLearning: boolean;
};

export default function TrainingProcess({ state, rounds, keepLearning }: TrainingProcessProps) {
  const now = state.stage ? ORDER.indexOf(state.stage) : -1;
  const status = (s: Stage) => {
    // The learning row covers "start" and "round".
    const i = ORDER.indexOf(s);
    const end = s === "start" ? ORDER.indexOf("round") : i;
    if (state.finished || end < now) return "done";
    return now >= i && now <= end ? "running" : "waiting";
  };
  const count = (c: { done: number; total: number }) => (c.total ? `${c.done} / ${c.total}` : "");
  const share = (c: { done: number; total: number }) => (c.total ? c.done / c.total : 0);

  const rows: { stage: Stage; title: string; detail: string; progress?: number }[] = [
    { stage: "load", title: "Load your photos", detail: count(state.load), progress: share(state.load) },
    {
      stage: "shrink",
      title: "Shrink each to 64 × 64 pixels",
      detail: count(state.shrink),
      progress: share(state.shrink),
    },
    {
      stage: "pixels",
      title: "Turn each photo into 12,288 numbers",
      detail: count(state.pixels),
      progress: share(state.pixels),
    },
    {
      stage: "split",
      title: "Keep about 1 in 5 aside to test fairly",
      detail: state.split ? `${state.split.train} to learn, ${state.split.heldOut} to test` : "",
    },
    {
      stage: "start",
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
            {r.stage === "pixels" && state.photo && <PhotoToNumbers photo={state.photo} />}
            {r.stage === "start" && state.inside && state.before && state.spy && (
              <InsideView
                before={state.before}
                inside={state.inside}
                spy={state.spy}
                round={state.round?.round ?? 0}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// The photo being read right now: photo → 64 px → mirror → its numbers.
function PhotoToNumbers({ photo }: { photo: NonNullable<ProcessState["photo"]> }) {
  const arrow = <span className="text-muted" aria-hidden>→</span>;
  // The color of the middle pixel, as the model gets it (0 to 255 here, 0 to 1 inside).
  const [r, g, b] = photo.pixels.getContext("2d")?.getImageData(32, 32, 1, 1).data ?? [0, 0, 0];
  return (
    <div className="ml-10 grid gap-2 rounded-xl bg-page p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Figure caption="your photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage link */}
          <img src={photo.url} alt="Photo being read" className="size-20 rounded-lg object-cover" />
        </Figure>
        {arrow}
        <Figure caption="64 × 64 px">
          <CanvasCopy source={photo.pixels} label="The photo shrunk to 64 by 64 pixels" />
        </Figure>
        {arrow}
        <Figure caption="mirror copy">
          <CanvasCopy source={photo.mirror} label="The same photo flipped" />
        </Figure>
      </div>
      <span className="text-[13px] text-muted">
        64 × 64 pixels × 3 colors (red, green, blue) = 12,288 numbers. The middle pixel is red{" "}
        {r}, green {g}, blue {b}. The model only ever sees numbers like these.
      </span>
    </div>
  );
}

// Inside the model: its first pattern detectors, and what each layer finds in one photo.
function InsideView({
  before,
  inside,
  spy,
  round,
}: {
  before: Inside;
  inside: Inside;
  spy: HTMLCanvasElement;
  round: number;
}) {
  return (
    <div className="ml-10 grid gap-4 rounded-xl bg-page p-3">
      <div className="grid gap-2">
        <b className="text-[15px]">Its pattern detectors</b>
        <span className="text-[13px] text-muted">
          The first layer has 8 detectors. Each looks at 3 × 3 pixels and lights up when it finds
          its pattern. They start as random noise. Each round they change a little toward
          patterns that help tell cats apart.
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          <Detectors caption="Before learning (random)" pictures={before.filters} />
          <Detectors caption={round ? `Now, after round ${round}` : "Now"} pictures={inside.filters} />
        </div>
        {round > 0 && (
          <span className="text-center text-[13px] text-muted">
            Their numbers changed by about <b className="text-ink">{Math.round(inside.change * 100)}%</b>{" "}
            since the start. Small steps each round add up.
          </span>
        )}
      </div>
      <div className="grid gap-2">
        <b className="text-[15px]">What it sees in one photo</b>
        <span className="text-[13px] text-muted">
          A photo it never learns from goes through each layer. White = the detector found its
          pattern there. Each layer is smaller and finds bigger, more mixed patterns.
        </span>
        <div className="flex flex-wrap items-start gap-3">
          <Figure caption="the photo, 64 × 64">
            <CanvasCopy source={spy} label="The photo the model is looking at" />
          </Figure>
          {inside.maps.map((layer, i) => (
            <Figure
              key={i}
              caption={`layer ${i + 1}: ${layer.size} × ${layer.size}, ${Math.min(layer.pictures.length, layer.total)} of ${layer.total}`}
            >
              <div className="grid grid-cols-4 gap-0.5">
                {layer.pictures.map((p, j) => (
                  <PictureCanvas
                    key={j}
                    picture={p}
                    className="size-9 rounded-sm"
                    label={`Layer ${i + 1}, detector ${j + 1}`}
                  />
                ))}
              </div>
            </Figure>
          ))}
        </div>
      </div>
    </div>
  );
}

function Detectors({ caption, pictures }: { caption: string; pictures: Pic[] }) {
  return (
    <Figure caption={caption}>
      <div className="flex flex-wrap justify-center gap-1.5">
        {pictures.map((p, i) => (
          <PictureCanvas key={i} picture={p} className="size-8 rounded-sm" label={`Detector ${i + 1}`} />
        ))}
      </div>
    </Figure>
  );
}

function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="grid justify-items-center gap-1">
      {children}
      <figcaption className="text-center text-[12px] text-muted">{caption}</figcaption>
    </figure>
  );
}

// Draws a small picture made of raw RGBA bytes, blown up with sharp pixels.
function PictureCanvas({ picture, className, label }: { picture: Pic; className: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.height = picture.width;
    c.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(picture.data), picture.width), 0, 0);
  }, [picture]);
  return <canvas ref={ref} role="img" aria-label={label} className={className} style={{ imageRendering: "pixelated" }} />;
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
