import { X } from "lucide-react";

export type Label = "cat" | "not";

type PhotoTileProps = {
  src: string;
  label?: Label | null;
  onLabel?: (label: Label) => void;
  onRemove?: () => void;
};

export default function PhotoTile({
  src,
  label,
  onLabel,
  onRemove,
}: PhotoTileProps) {
  const border =
    label === "cat"
      ? "border-cat"
      : label === "not"
        ? "border-green"
        : "border-line";

  return (
    <div
      className={`relative grid overflow-hidden rounded-xl border-2 bg-card ${border}`}
    >
      <img src={src} alt="" className="aspect-square w-full object-cover" />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove photo"
          className="absolute top-1.5 right-1.5 grid size-8 cursor-pointer place-items-center rounded-full bg-ink/75 text-white"
        >
          <X className="size-4" />
        </button>
      )}
      {onLabel && (
        <div className="grid grid-cols-2 text-center text-[15px] font-bold">
          <button
            type="button"
            aria-pressed={label === "cat"}
            onClick={() => onLabel("cat")}
            className={`cursor-pointer border-t-2 border-line px-1 py-2.5 ${label === "cat" ? "bg-cat-soft text-cat" : "text-muted"}`}
          >
            Cat
          </button>
          <button
            type="button"
            aria-pressed={label === "not"}
            onClick={() => onLabel("not")}
            className={`cursor-pointer border-t-2 border-l-2 border-line px-1 py-2.5 ${label === "not" ? "bg-green-soft text-green" : "text-muted"}`}
          >
            Not cat
          </button>
        </div>
      )}
    </div>
  );
}
