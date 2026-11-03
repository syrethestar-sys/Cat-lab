import type { ReactNode } from "react";

const tones = {
  cat: "bg-cat-soft text-cat",
  not: "bg-green-soft text-green",
  open: "bg-page text-muted",
};

type PillProps = {
  tone: keyof typeof tones;
  children: ReactNode;
};

export default function Pill({ tone, children }: PillProps) {
  return (
    <span
      className={`rounded-full px-3.5 py-1.5 text-[15px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
