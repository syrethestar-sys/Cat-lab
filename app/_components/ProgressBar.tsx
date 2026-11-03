type ProgressBarProps = {
  value: number;
  label: string;
  color?: "blue" | "cat";
};

export default function ProgressBar({
  value,
  label,
  color = "blue",
}: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-3.5 overflow-hidden rounded-[7px] border border-line bg-page"
    >
      <div
        className={`h-full rounded-[7px] ${color === "cat" ? "bg-cat" : "bg-blue"}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
