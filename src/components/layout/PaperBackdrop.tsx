export function PaperBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,118,110,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,118,110,0.035)_1px,transparent_1px)] bg-[size:40px_40px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-12 h-80 w-80 rounded-full bg-primary/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-10 h-96 w-96 rounded-full bg-cta/10 blur-3xl"
      />
    </>
  );
}
