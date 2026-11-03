type StepCardProps = {
  step: number;
  text: string;
};

export default function StepCard({ step, text }: StepCardProps) {
  return (
    <h2 className="font-heading text-[22px] font-semibold sm:text-[26px]">
      Step {step}: {text}
    </h2>
  );
}
