import type { ReactNode } from "react";

type MainButtonProps = {
  children: ReactNode;
  locked?: boolean;
  big?: boolean;
  onClick?: () => void;
};

export default function MainButton({
  children,
  locked = false,
  big = false,
  onClick,
}: MainButtonProps) {
  const size = big
    ? "px-[34px] py-[18px] text-[19px]"
    : "px-[26px] py-[14px] text-[17px]";
  const color = locked
    ? "cursor-not-allowed bg-line text-muted"
    : "cursor-pointer bg-blue text-white hover:brightness-110";

  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      className={`rounded-xl font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue ${size} ${color}`}
    >
      {children}
    </button>
  );
}
