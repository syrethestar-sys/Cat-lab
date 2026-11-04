import type { Label } from "./PhotoTile";

type ResultTileProps = {
  src: string;
  answer: Label; // what the photo really is (the student's label)
  guess: Label; // what the model said
  sure: number; // 50 to 100
};

const name = (l: Label) => (l === "cat" ? "cat" : "not cat");

// One test photo after checking: green border = right, red = wrong.
export default function ResultTile({ src, answer, guess, sure }: ResultTileProps) {
  const right = answer === guess;
  return (
    <div
      className={`grid overflow-hidden rounded-xl border-2 bg-card ${right ? "border-green" : "border-red"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage link */}
      <img src={src} alt={`Really ${name(answer)}`} className="aspect-square w-full object-cover" />
      <div className="grid border-t-2 border-line px-2.5 py-2 text-sm">
        <b className={right ? "text-green" : "text-red"}>{right ? "Right" : "Wrong"}</b>
        <span>
          Guessed: {name(guess)}, {sure}% sure
        </span>
        {!right && sure < 65 && (
          <span className="text-muted">It almost couldn&apos;t decide.</span>
        )}
      </div>
    </div>
  );
}
