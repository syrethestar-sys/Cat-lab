"use client";

import { useEffect, useState } from "react";
import BackButton from "./BackButton";
import Card from "./Card";
import HelpBox from "./HelpBox";
import MainButton from "./MainButton";
import PhotoTile, { type Label } from "./PhotoTile";
import Pill from "./Pill";
import StepCard from "./StepCard";
import Steps from "./Steps";
import UploadBox from "./UploadBox";

type Photo = { id: string; url: string; label: Label | null };

const photoGrid = "grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;


export default function CatLab() {
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Saved photos come from the server, with fresh 1-hour links.
  useEffect(() => {
    fetch("/api/photos?ground=training")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setPhotos)
      .catch(() => setError("Could not load your photos. Reload to try again."))
      .finally(() => setLoading(false));
  }, []);

  const cats = photos.filter((p) => p.label === "cat").length;
  const nots = photos.filter((p) => p.label === "not_cat").length;
  const left = photos.length - cats - nots;

  // Steps past `reached` stay locked; Next only shows once a step is done.
  function go(n: number) {
    setStep(n);
    setReached((r) => Math.max(r, n));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Changing photos or labels means later steps must be done again.
  function changed() {
    setReached(step);
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

  function setLabel(id: string, label: Label) {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, label } : p)));
    changed();
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
  } else {
    content = (
      <>
        <StepCard step={3} text="Train the model" />
        <div className="flex flex-wrap justify-center gap-2.5">
          <Pill tone="cat">Cat: {cats}</Pill>
          <Pill tone="not">Not cat: {nots}</Pill>
        </div>
        <div className="flex justify-center">
          <MainButton big locked>
            Start training
          </MainButton>
        </div>
        <HelpBox title="Not connected yet.">
          The model has not been added to the app, so training cannot start.
          Your {plural(photos.length, "labeled photo")} are ready for it.
        </HelpBox>
        <div className="flex flex-wrap justify-between gap-3">
          <BackButton onClick={() => go(2)} />
          <MainButton locked>Finish training to continue</MainButton>
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
