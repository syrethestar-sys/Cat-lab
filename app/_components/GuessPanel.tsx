import ProgressBar from "./ProgressBar";

type GuessPanelProps = {
  src: string;
  guess: "cat" | "not_cat";
  sure: number;
};

export default function GuessPanel({ src, guess, sure }: GuessPanelProps) {
  const isCat = guess === "cat";

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[150px_1fr]">
      <img
        src={src}
        alt="The photo you tested"
        className="aspect-square w-[150px] rounded-xl border-2 border-line object-cover"
      />
      <div className="grid gap-2.5">
        <span className="text-muted">The model thinks this is</span>
        <span
          className={`font-heading text-[26px] font-semibold ${isCat ? "text-cat" : "text-green"}`}
        >
          {isCat ? "A cat" : "Not a cat"}
        </span>
        <ProgressBar
          value={sure}
          label="How sure the model is"
          color={isCat ? "cat" : "blue"}
        />
        <span className="text-muted">It is {sure}% sure.</span>
      </div>
    </div>
  );
}
