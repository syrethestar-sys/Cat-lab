"use client";

import type { LayersModel } from "@tensorflow/tfjs";
import { useEffect, useRef, useState } from "react";
import AccuracyChart from "./AccuracyChart";
import BackButton from "./BackButton";
import Card from "./Card";
import GuessPanel from "./GuessPanel";
import HelpBox from "./HelpBox";
import MainButton from "./MainButton";
import PhotoTile, { type Label } from "./PhotoTile";
import Pill from "./Pill";
import ProgressBar from "./ProgressBar";
import RoundsPicker, { type Rounds } from "./RoundsPicker";
import StepCard from "./StepCard";
import Steps from "./Steps";
import UploadBox from "./UploadBox";
import { hasSavedModel } from "../_lib/saved-model";

type Photo = { id: string; url: string; label: Label | null };
type Guess = { url: string; guess: "cat" | "not_cat"; sure: number };

const photoGrid = "grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const labeledCount = (cats: number, nots: number) => Math.min(cats, nots);

export default function CatLab() {
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<Rounds>(30);
  const [training, setTraining] = useState(false);
  const [trained, setTrained] = useState(false);
  const [history, setHistory] = useState<number[]>([]); // accuracy after each round
  const [modelState, setModelState] = useState<"idle" | "loading" | "ready" | "missing">("idle");
  const [guess, setGuess] = useState<Guess | null>(null);
  const [guessing, setGuessing] = useState(false);
  const modelRef = useRef<LayersModel | null>(null);

  // Saved photos come from the server, with fresh 1-hour links.
  useEffect(() => {
    fetch("/api/photos?ground=training")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setPhotos)
      .catch(() => setError("Could not load your photos. Reload to try again."))
      .finally(() => setLoading(false));
  }, []);

  // A model saved in this browser earlier unlocks Step 4, so you can test without training again.
  useEffect(() => {
    hasSavedModel().then((saved) => {
      if (saved) setReached((r) => Math.max(r, 4));
    });
  }, []);

  // Load the saved model from IndexedDB when Step 4 opens.
  useEffect(() => {
    if (step !== 4 || modelRef.current) return;
    let cancelled = false;
    setModelState("loading");
    import("../_lib/model")
      .then((m) => m.loadModel())
      .then((model) => {
        if (cancelled) return;
        modelRef.current = model;
        setModelState("ready");
      })
      .catch(() => {
        if (!cancelled) setModelState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const cats = photos.filter((p) => p.label === "cat").length;
  const nots = photos.filter((p) => p.label === "not_cat").length;
  const left = photos.length - cats - nots;

  // Steps past `reached` stay locked; Next only shows once a step is done.
  function go(n: number) {
    if (training) return; // don't leave the screen while the model is learning
    setStep(n);
    setReached((r) => Math.max(r, n));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Changing photos or labels means later steps must be done again.
  function changed() {
    setReached(step);
    setTrained(false);
    setHistory([]);
  }

  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    setSkipped(files.length - images.length);
    setError("");
    for (const file of images) {
      const body = new FormData();
      body.append("file", file);
      body.append("ground", "training");
      const res = await fetch("/api/photos", { method: "POST", body });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error;
        setError(msg ?? "Could not upload that photo.");
        continue;
      }
      const photo: Photo = await res.json();
      setPhotos((ps) => [...ps, photo]);
    }
    changed();
  }

  async function removePhoto(id: string) {
    const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not remove that photo.");
      return;
    }
    setPhotos((ps) => ps.filter((p) => p.id !== id));
    changed();
  }

  // Update the screen first so it feels instant, then save. Undo if saving fails.
  async function setLabel(id: string, label: Label) {
    const before = photos.find((p) => p.id === id)?.label ?? null;
    setError("");
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, label } : p)));
    changed();

    const res = await fetch(`/api/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(() => null);

    if (!res?.ok) {
      setPhotos((ps) =>
        ps.map((p) => (p.id === id ? { ...p, label: before } : p)),
      );
      setError("Could not save that label. Try again.");
    }
  }

  async function startTraining() {
    setTraining(true);
    setTrained(false);
    setHistory([]);
    setError("");
    setGuess(null);
    // The old model is about to be replaced, so forget it.
    modelRef.current?.dispose();
    modelRef.current = null;
    setModelState("idle");
    try {
      // Ask the server for the labeled photos, with fresh 1-hour links.
      const res = await fetch("/api/photos?ground=training");
      if (!res.ok) throw new Error("Could not load your photos.");
      const all: Photo[] = await res.json();
      const labeled = all.filter(
        (p): p is Photo & { label: Label } => p.label !== null && p.url !== "",
      );
      if (
        !labeled.some((p) => p.label === "cat") ||
        !labeled.some((p) => p.label === "not_cat")
      ) {
        throw new Error("Label at least 1 cat and 1 not cat first.");
      }

      // TensorFlow.js is big, so load it only when training starts.
      const { train, MODEL_URL } = await import("../_lib/model");
      const accuracy = await train(labeled, rounds, (_round, acc) =>
        setHistory((h) => [...h, acc]),
      );
      setTrained(true);

      const run = await fetch("/api/training-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds, accuracy, modelUrl: MODEL_URL }),
      });
      if (!run.ok) {
        setError("The model is saved, but this training run was not recorded.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training stopped.");
    } finally {
      setTraining(false);
    }
  }

  // The test photo is saved with ground = "testing", so training never uses it.
  async function guessFile(files: File[]) {
    const file = files[0];
    const model = modelRef.current;
    if (!file || !model) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be tested.");
      return;
    }
    setError("");
    setGuessing(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("ground", "testing");
      const res = await fetch("/api/photos", { method: "POST", body });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error;
        throw new Error(msg ?? "Could not upload that photo.");
      }
      const photo: Photo = await res.json();

      const { loadPixels, predict } = await import("../_lib/model");
      const result = predict(model, await loadPixels(photo.url));
      setGuess({ url: photo.url, ...result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not test that photo.");
    } finally {
      setGuessing(false);
    }
  }

  let content;

  if (step === 1) {
    const need = 2 - photos.length;
    content = (
      <>
        <StepCard step={1} text="Add your photos" />
        <UploadBox
          title="Click to choose photos"
          text="You can pick many photos at once, or drop them here"
          onFiles={addFiles}
        />
        {error && <p className="text-[15px] text-red">{error}</p>}
        {loading && <p className="text-muted">Loading your photos…</p>}
        {skipped > 0 && (
          <p className="text-[15px] text-red">
            {plural(skipped, "file")} skipped. Only image files can be added.
          </p>
        )}
        {photos.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Pill tone="open">{plural(photos.length, "photo")} added</Pill>
            </div>
            <div className={photoGrid}>
              {photos.map((p) => (
                <PhotoTile
                  key={p.id}
                  src={p.url}
                  onRemove={() => removePhoto(p.id)}
                />
              ))}
            </div>
          </>
        )}
        <HelpBox title="Why so many photos?">
          The model learns only from what you show it. Add cats and things that
          are not cats. 10 or more of each works best.
        </HelpBox>
        <div className="flex justify-end">
          {need > 0 ? (
            <MainButton locked>Add {plural(need, "more photo")}</MainButton>
          ) : (
            <MainButton onClick={() => go(2)}>Next: Label photos</MainButton>
          )}
        </div>
      </>
    );
  } else if (step === 2) {
    const blocker = left
      ? `Label ${left} more to continue`
      : !cats
        ? "Label at least 1 cat"
        : !nots
          ? "Label at least 1 not cat"
          : null;
    content = (
      <>
        <StepCard step={2} text="Tell the model what each photo is" />
        <div className="flex flex-wrap gap-2.5">
          <Pill tone="cat">Cat: {cats}</Pill>
          <Pill tone="not">Not cat: {nots}</Pill>
          <Pill tone="open">Still to label: {left}</Pill>
        </div>
        <div className={photoGrid}>
          {photos.map((p) => (
            <PhotoTile
              key={p.id}
              src={p.url}
              label={p.label}
              onLabel={(l) => setLabel(p.id, l)}
            />
          ))}
        </div>
        {error && <p className="text-[15px] text-red">{error}</p>}
        <HelpBox title="Why label?">
          Your labels are the answers. The model compares its guesses with them
          to learn.
        </HelpBox>
        <div className="flex flex-wrap justify-between gap-3">
          <BackButton onClick={() => go(1)} />
          {blocker ? (
            <MainButton locked>{blocker}</MainButton>
          ) : (
            <MainButton onClick={() => go(3)}>Next: Train the model</MainButton>
          )}
        </div>
      </>
    );
  } else if (step === 3) {
    const started = training || trained || history.length > 0;
    const lastAcc = history.at(-1);
    content = (
      <>
        <StepCard step={3} text="Train the model" />
        <div className="flex flex-wrap justify-center gap-2.5">
          <Pill tone="cat">Cat: {cats}</Pill>
          <Pill tone="not">Not cat: {nots}</Pill>
        </div>
        {!started && (
          <RoundsPicker value={rounds} onChange={setRounds} disabled={training} />
        )}
        <div className="flex justify-center">
          {training ? (
            <MainButton big locked>
              Training…
            </MainButton>
          ) : (
            <MainButton big onClick={startTraining}>
              {trained ? "Train again" : "Start training"}
            </MainButton>
          )}
        </div>
        {started && (
          <>
            <div className="text-center font-heading text-[44px] leading-tight font-semibold">
              <div className="font-sans text-[15px] font-normal text-muted">
                Round
              </div>
              {history.length} / {rounds}
            </div>
            <ProgressBar
              value={Math.round((history.length / rounds) * 100)}
              label="Training progress"
            />
            <AccuracyChart values={history} rounds={rounds} />
          </>
        )}
        {trained && lastAcc !== undefined && (
          <p className="text-center">
            Done. The model is right on <b>{Math.round(lastAcc * 100)}%</b> of
            your photos. It is saved in this browser.
          </p>
        )}
        {error && <p className="text-[15px] text-red">{error}</p>}
        <HelpBox title="What is happening?">
          After each round the model checks its guesses against your labels and
          fixes itself a little.
          {labeledCount(cats, nots) < 10 &&
            ` You have ${plural(cats + nots, "labeled photo")}. 10 or more of each group works best.`}
        </HelpBox>
        <div className="flex flex-wrap justify-between gap-3">
          <BackButton onClick={() => go(2)} disabled={training} />
          {trained ? (
            <MainButton onClick={() => go(4)}>Next: Test the model</MainButton>
          ) : (
            <MainButton locked>
              {training ? "Training…" : "Finish training to continue"}
            </MainButton>
          )}
        </div>
      </>
    );
  } else {
    content = (
      <>
        <StepCard step={4} text="Test with new photos" />
        {modelState === "loading" && (
          <p className="text-center text-muted">Loading the model…</p>
        )}
        {modelState === "missing" && (
          <HelpBox title="No model yet.">
            There is no trained model saved in this browser. Go back and train
            it first.
          </HelpBox>
        )}
        {modelState === "ready" && (
          <>
            <UploadBox
              multiple={false}
              title={guess ? "Try another photo" : "Choose a photo to test"}
              text="One photo at a time, or drop it here"
              onFiles={guessFile}
            />
            {guessing && (
              <p className="text-center text-muted">Looking at your photo…</p>
            )}
            {guess && !guessing && (
              <GuessPanel src={guess.url} guess={guess.guess} sure={guess.sure} />
            )}
          </>
        )}
        {error && <p className="text-[15px] text-red">{error}</p>}
        <HelpBox title="Why test?">
          Test photos are saved apart from your training photos, so the model
          never learns from them. That shows how it does on photos it has not
          seen.
        </HelpBox>
        <div className="flex flex-wrap justify-between gap-3">
          <BackButton onClick={() => go(3)} />
        </div>
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <Steps current={step} reached={reached} onGo={go} />
      <Card key={step}>{content}</Card>
    </section>
  );
}
