type BackButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export default function BackButton({
  onClick,
  disabled = false,
}: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border-2 border-line bg-transparent px-[26px] py-[14px] text-[17px] font-bold text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      Back
    </button>
  );
}
