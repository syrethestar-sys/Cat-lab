import type { ReactNode } from "react";

type HelpBoxProps = {
  title: string;
  children: ReactNode;
};

export default function HelpBox({ title, children }: HelpBoxProps) {
  return (
    <div className="rounded-xl bg-blue-soft px-4 py-3.5 text-[15px]">
      <b>{title}</b> {children}
    </div>
  );
}
