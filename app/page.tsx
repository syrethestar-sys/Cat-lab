import CatLab from "./_components/CatLab";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pt-8 pb-20">
      <header className="text-center">
        <h1 className="text-[28px]">🐱 Cat Lab</h1>
        <p className="mt-1 text-muted">
          Teach the model to tell cats from other things.
        </p>
      </header>
      <CatLab />
    </main>
  );
}
