export const ROUND_OPTIONS = [10, 30, 50] as const;
export type Rounds = (typeof ROUND_OPTIONS)[number];

type RoundsPickerProps = {
  value: Rounds;
  onChange: (rounds: Rounds) => void;
  disabled?: boolean;
};

export default function RoundsPicker({
  value,
  onChange,
  disabled = false,
}: RoundsPickerProps) {
  return (
    <div className="grid justify-items-center gap-2">
      <span className="text-[15px] text-muted">How many rounds?</span>
      <div className="flex gap-2">
        {ROUND_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`rounded-xl border-2 px-5 py-2 text-[15px] font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue ${
              value === n
                ? "border-blue bg-blue-soft text-blue"
                : "border-line text-muted"
            } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
