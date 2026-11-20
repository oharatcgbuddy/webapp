import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/shop-access";

type Row = {
  id: string;
  title: string;
  venue: string | null;
  starts_at: string;
  status: "scheduled" | "completed" | "cancelled";
};

const STATUS = {
  scheduled: { text: "In programma", cls: "bg-brand-green" },
  completed: { text: "Concluso", cls: "bg-white" },
  cancelled: { text: "Annullato", cls: "bg-brand-red" },
} as const;

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function Regionals() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  // Pagina riservata agli admin: per gli altri non esiste.
  if (!(await isAdmin(supabase, auth.user?.id ?? ""))) notFound();

  const { data, error } = await supabase
    .from("tournaments")
    .select("id, title, venue, starts_at, status")
    .eq("kind", "regional")
    .order("starts_at", { ascending: false })
    .limit(200)
    .overrideTypes<Row[], { merge: false }>();

  if (error) {
    return (
      <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
        Impossibile caricare i tornei. Riprova più tardi.
      </p>
    );
  }

  const rows = data ?? [];
  return (
    <>
      <p className="text-sm font-medium">{rows.length} tornei Regionals</p>
      {rows.length === 0 ? (
        <p className="brutal-card p-4 text-sm">Nessun Regional ancora.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} className="brutal-card space-y-1 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase">{dateFmt.format(new Date(t.starts_at))}</p>
                  <Link href={`/admin/tornei/${t.id}`} className="font-black underline decoration-[3px]">
                    {t.title}
                  </Link>
                  {t.venue && <p className="text-sm">{t.venue}</p>}
                </div>
                <span className={`shrink-0 border-2 border-ink px-2 py-1 text-xs font-black uppercase ${STATUS[t.status].cls}`}>
                  {STATUS[t.status].text}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AdminRegionalsPage() {
  return (
    <>
      <PageHeader title="Regionals" subtitle="Area admin · tornei senza negozio" />
      <main className="space-y-4 p-4">
        <Link href="/admin/tornei/nuovo" className="brutal-btn w-full bg-brand-green">
          + Nuovo torneo
        </Link>
        <Suspense fallback={<p>Caricamento…</p>}>
          <Regionals />
        </Suspense>
      </main>
    </>
  );
}
