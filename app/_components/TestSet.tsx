import MainButton from "./MainButton";
import PhotoTile, { type Label } from "./PhotoTile";
import Pill from "./Pill";
import ProgressBar from "./ProgressBar";
import ResultTile from "./ResultTile";
import UploadBox from "./UploadBox";

export type TestPhoto = { id: string; url: string; label: Label | null };
export type TestGuess = { guess: Label; sure: number };

type TestSetProps = {
  photos: TestPhoto[];
  results: Record<string, TestGuess> | null; // guesses from the last check, by photo id
  lastScore: number | null; // % right in the check before this one, to compare
  checking: { done: number; total: number } | null;
  uploading: boolean;
  error: string;
  onAdd: (files: File[]) => void;
  onLabel: (id: string, label: Label) => void;
  onRemove: (id: string) => void;
  onCheck: () => void;
  onEdit: () => void; // hide the score and show the label tiles again
};

const grid = "grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function TestSet({
  photos,
  results,
  lastScore,
  checking,
  uploading,
  error,
  onAdd,
  onLabel,
  onRemove,
  onCheck,
  onEdit,
}: TestSetProps) {
  const unlabeled = photos.filter((p) => p.label === null).length;
  const scored = results
    ? photos.flatMap((p) => (p.label && results[p.id] ? [{ ...p, label: p.label, ...results[p.id] }] : []))
    : [];
  const right = scored.filter((p) => p.label === p.guess);
  const group = (l: Label) => {
    const all = scored.filter((p) => p.label === l);
    return { right: all.filter((p) => p.guess === l).length, total: all.length };
  };
  const score = scored.length ? Math.round((right.length / scored.length) * 100) : 0;
  // Wrong guesses first: they teach the most. Least sure first inside each group.
  const ordered = [...scored].sort(
    (a, b) => Number(a.label === a.guess) - Number(b.label === b.guess) || a.sure - b.sure,
  );

  return (
    <section className="grid gap-4 border-t-2 border-line pt-5" aria-label="Test score">
      <div className="grid gap-1">
        <h3 className="text-[22px]">Test score</h3>
        <p className="text-[15px] text-muted">
          Add photos the model has never seen and say what each one really is. Then the
          model guesses them all, and you see how many it gets right.
        </p>
      </div>
      <UploadBox
        title="Add test photos"
        text="Pick many at once, or drop them here"
        onFiles={onAdd}
      />
      {uploading && <p className="text-muted">Uploading…</p>}
      {error && <p className="text-[15px] text-red">{error}</p>}

      {photos.length > 0 && !results && (
        <>
          <div className="flex flex-wrap gap-2.5">
            <Pill tone="cat">Cat: {photos.filter((p) => p.label === "cat").length}</Pill>
            <Pill tone="not">Not cat: {photos.filter((p) => p.label === "not_cat").length}</Pill>
            {unlabeled > 0 && <Pill tone="open">Still to label: {unlabeled}</Pill>}
          </div>
          <div className={grid}>
            {photos.map((p) => (
              <PhotoTile
                key={p.id}
                src={p.url}
                label={p.label}
                onLabel={checking ? undefined : (l) => onLabel(p.id, l)}
                onRemove={checking ? undefined : () => onRemove(p.id)}
              />
            ))}
          </div>
        </>
      )}

      {checking && (
        <div className="grid gap-2">
          <p className="text-center text-muted">
            The model is guessing… {checking.done} / {checking.total}
          </p>
          <ProgressBar
            value={Math.round((checking.done / checking.total) * 100)}
            label="Checking progress"
          />
        </div>
      )}

      {results && scored.length > 0 && (
        <>
          <div className="grid gap-1 text-center">
            <div className="font-heading text-[34px] leading-tight font-semibold">
              Right on {right.length} of {scored.length} ({score}%)
            </div>
            <p className="text-[15px] text-muted">
              Cats: {group("cat").right} of {group("cat").total} · Not cats:{" "}
              {group("not_cat").right} of {group("not_cat").total}
              {lastScore !== null && ` · Last check: ${lastScore}%`}
            </p>
          </div>
          <div className={grid}>
            {ordered.map((p) => (
              <ResultTile key={p.id} src={p.url} answer={p.label} guess={p.guess} sure={p.sure} />
            ))}
          </div>
          <div className="grid justify-items-center gap-2 text-center text-[15px] text-muted">
            <p>Train more in Step 3, then check again to compare.</p>
            <button
              type="button"
              onClick={onEdit}
              className="cursor-pointer rounded-full border-2 border-line px-3.5 py-1 font-bold text-muted hover:border-blue hover:text-blue focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              Edit test photos
            </button>
          </div>
        </>
      )}

      {photos.length > 0 && !checking && (
        <div className="flex justify-center">
          {unlabeled > 0 ? (
            <MainButton locked>Label {plural(unlabeled, "more photo")} to check</MainButton>
          ) : (
            <MainButton onClick={onCheck}>{results ? "Check again" : "Check the model"}</MainButton>
          )}
        </div>
      )}
    </section>
  );
}
