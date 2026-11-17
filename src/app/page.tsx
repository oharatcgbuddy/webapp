import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TCGS } from "@/lib/tcgs";

// Scelta del gioco. Con un solo gioco attivo il proxy porta direttamente alla sua home
// (vedi src/proxy.ts); questa pagina compare da sola quando ce n'è più di uno, oppure con /?scegli=1.
export default function HomePage() {
  return (
    <>
      <PageHeader title="Scegli il gioco" subtitle="Ohara TCG Buddy" />
      <main className="space-y-4 p-4">
        <ul className="space-y-3">
          {TCGS.map((t) => (
            <li key={t.slug}>
              <Link href={`/${t.slug}`} className="brutal-card block p-4">
                <span className="block text-2xl font-black uppercase leading-tight">{t.name}</span>
                <span className="mt-1 block text-sm">{t.description}</span>
                <span className="mt-3 inline-block border-[3px] border-ink bg-brand-yellow px-3 py-2 font-bold">
                  Entra →
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm font-medium">Altri giochi in arrivo.</p>
      </main>
    </>
  );
}
