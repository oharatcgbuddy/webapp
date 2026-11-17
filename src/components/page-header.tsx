import Image from "next/image";
import Link from "next/link";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b-[3px] border-ink bg-brand-yellow px-4 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="min-w-0">
        <h1 className="text-3xl font-black uppercase tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm font-medium">{subtitle}</p>}
      </div>
      <Link href="/" aria-label="Ohara TCG Buddy, vai ai tornei" className="shrink-0">
        <Image src="/logo.png" alt="" width={64} height={64} priority className="h-16 w-16" />
      </Link>
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
