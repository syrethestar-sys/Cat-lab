type BackButtonProps = {
  onClick: () => void;
};

export default function BackButton({ onClick }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-xl border-2 border-line bg-transparent px-[26px] py-[14px] text-[17px] font-bold text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue"
    >
      Back
    </button>
  );
}
