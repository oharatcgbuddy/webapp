export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b-[3px] border-ink bg-brand-yellow px-4 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <h1 className="text-3xl font-black uppercase tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm font-medium">{subtitle}</p>}
    </header>
  );
}

export function ComingSoon({ phase }: { phase: string }) {
  return (
    <main className="p-4">
      <div className="brutal-card p-4">
        <p className="font-bold">In arrivo</p>
        <p className="text-sm">Questa schermata sarà disponibile in {phase}.</p>
      </div>
    </main>
  );
}
