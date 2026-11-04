export type TrainMode = "fresh" | "keep";

const OPTIONS: { value: TrainMode; label: string }[] = [
  { value: "fresh", label: "Start fresh" },
  { value: "keep", label: "Keep learning" },
];

type ModeToggleProps = {
  value: TrainMode;
  onChange: (mode: TrainMode) => void;
  disabled?: boolean;
};

export default function ModeToggle({ value, onChange, disabled = false }: ModeToggleProps) {
  return (
    <div className="grid justify-items-center gap-2">
      <span className="text-[15px] text-muted">Start from</span>
      <div className="flex flex-wrap justify-center gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-xl border-2 px-5 py-2 text-[15px] font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue ${
              value === o.value
                ? "border-blue bg-blue-soft text-blue"
                : "border-line text-muted"
            } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="text-center text-[14px] text-muted">
        {value === "keep"
          ? "Keeps what the saved model learned and trains it more."
          : "Forgets the saved model and learns from zero."}
      </span>
    </div>
  );
}
