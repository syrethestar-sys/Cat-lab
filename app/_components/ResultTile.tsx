import type { LucideIcon } from "lucide-react";

type ResultTileProps = {
  icon: LucideIcon;
  tone: string;
  right: boolean;
  guess: string;
};

export default function ResultTile({
  icon: Icon,
  tone,
  right,
  guess,
}: ResultTileProps) {
  return (
    <div
      className={`grid overflow-hidden rounded-xl border-2 bg-card ${right ? "border-green" : "border-red"}`}
    >
      <div className={`grid aspect-square place-items-center ${tone}`}>
        <Icon className="h-auto w-[56%]" />
      </div>
      <div className="grid border-t-2 border-line px-2.5 py-2 text-sm">
        <b className={right ? "text-green" : "text-red"}>
          {right ? "Right" : "Wrong"}
        </b>
        Guessed: {guess}
      </div>
    </div>
  );
}
