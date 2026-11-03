const labels = ["Upload", "Label", "Train", "Test"];

const dotStyles = {
  done: "border-blue bg-blue-soft text-blue",
  now: "border-blue bg-blue text-white",
  next: "border-line bg-card",
};

type StepsProps = {
  current: number;
  reached: number;
  onGo: (step: number) => void;
};

export default function Steps({ current, reached, onGo }: StepsProps) {
  return (
    <ol className="grid grid-cols-4 gap-2 text-center text-[15px] font-bold text-muted">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n === current ? "now" : n <= reached ? "done" : "next";
        const locked = n > reached;

        return (
          <li key={label}>
            <button
              type="button"
              disabled={locked}
              onClick={() => onGo(n)}
              aria-current={state === "now" ? "step" : undefined}
              className={`grid w-full justify-items-center gap-1.5 ${state === "now" ? "text-ink" : ""} ${locked ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
            >
              <span
                className={`grid size-10 place-items-center rounded-full border-2 font-heading text-lg font-semibold ${dotStyles[state]}`}
              >
                {n}
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
