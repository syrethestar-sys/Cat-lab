import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
};

export default function Card({ children }: CardProps) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-5 sm:p-7">
      {children}
    </div>
  );
}
