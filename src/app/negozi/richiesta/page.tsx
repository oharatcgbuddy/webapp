import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { RequestForm } from "./request-form";

type MyRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
  proposed: { name?: string } | null;
  shops: { name: string; slug: string } | null;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

const STATUS = {
  pending: { text: "In attesa", cls: "bg-brand-yellow" },
  approved: { text: "Approvata", cls: "bg-brand-green" },
  rejected: { text: "Rifiutata", cls: "bg-brand-red" },
} as const;

async function RequestLoader() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? "";

  const [{ data: shops }, { data: mine, error }] = await Promise.all([
    supabase.from("shops").select("id, name, city").eq("status", "approved").order("name").limit(500),
    supabase
      .from("shop_requests")
      .select("id, status, note, created_at, proposed, shops(name, slug)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20)
      .overrideTypes<MyRequest[], { merge: false }>(),
  ]);

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare le richieste. Riprova più tardi.
        </p>
      </main>
    );
  }

  const requests = mine ?? [];
  const hasPending = requests.some((r) => r.status === "pending");

  return (
    <>
      {hasPending ? (
        <main className="p-4">
          <div className="brutal-card p-4">
            <p className="font-bold">Richiesta in attesa</p>
            <p className="text-sm">Un admin la esaminerà presto. Potrai inviarne un&apos;altra dopo la risposta.</p>
          </div>
        </main>
      ) : (
        <RequestForm shops={shops ?? []} />
      )}

      {requests.length > 0 && (
        <section className="space-y-3 px-4 pb-4">
          <h2 className="font-black uppercase">Le tue richieste</h2>
          <ul className="space-y-3">
            {requests.map((r) => {
              const name = r.shops?.name ?? r.proposed?.name ?? "Negozio";
              return (
                <li key={r.id} className="brutal-card flex items-start justify-between gap-2 p-3">
                  <div>
                    <p className="text-xs font-bold uppercase">{dateFmt.format(new Date(r.created_at))}</p>
                    {r.status === "approved" && r.shops ? (
                      <Link href={`/negozi/${r.shops.slug}`} className="font-black underline decoration-[3px]">
                        {name}
                      </Link>
                    ) : (
                      <p className="font-black">{name}</p>
                    )}
                    {r.status === "rejected" && r.note && <p className="text-sm">Motivo: {r.note}</p>}
                  </div>
                  <span className={`border-2 border-ink px-2 py-1 text-xs font-black uppercase ${STATUS[r.status].cls}`}>
                    {STATUS[r.status].text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

export default function RichiestaPage() {
  return (
    <>
      <PageHeader title="Gestisci un negozio" subtitle="Richiedi l'accesso come gestore" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <RequestLoader />
      </Suspense>
    </>
  );
}
