import type { LucideIcon } from "lucide-react";
import ProgressBar from "./ProgressBar";

type GuessPanelProps = {
  icon: LucideIcon;
  tone: string;
  guess: "cat" | "not";
  sure: number;
};

export default function GuessPanel({
  icon: Icon,
  tone,
  guess,
  sure,
}: GuessPanelProps) {
  const isCat = guess === "cat";

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[150px_1fr]">
      <div
        className={`grid aspect-square w-[150px] place-items-center rounded-xl border-2 border-line ${tone}`}
      >
        <Icon className="h-auto w-[60%]" />
      </div>
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
