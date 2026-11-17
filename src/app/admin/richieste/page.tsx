import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { approveRequest, rejectRequest } from "./actions";

type PendingRequest = {
  id: string;
  created_at: string;
  proposed: {
    name?: string;
    city?: string;
    province?: string;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    description?: string | null;
  } | null;
  shops: { name: string; city: string | null; province: string | null } | null;
  profiles: { display_name: string | null; username: string | null } | null;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

async function Requests({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { errore } = await searchParams;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", auth.user?.id ?? "")
    .maybeSingle();
  // Pagina riservata agli admin: per gli altri non esiste.
  if (!me?.is_admin) notFound();

  const { data, error } = await supabase
    .from("shop_requests")
    .select(
      "id, created_at, proposed, shops(name, city, province), profiles!shop_requests_user_id_fkey(display_name, username)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100)
    .overrideTypes<PendingRequest[], { merge: false }>();

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare le richieste.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-4">
      {errore && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          Operazione non riuscita. Riprova.
        </p>
      )}

      {(data ?? []).length === 0 ? (
        <div className="brutal-card p-4">
          <p className="font-bold">Nessuna richiesta in attesa</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {(data ?? []).map((r) => {
            const p = r.proposed;
            const who = r.profiles?.display_name ?? r.profiles?.username ?? "Utente";
            return (
              <li key={r.id} className="brutal-card space-y-2 p-4">
                <p className="text-xs font-bold uppercase">
                  {dateFmt.format(new Date(r.created_at))} · da {who}
                </p>
                {r.shops ? (
                  <>
                    <p className="text-xs font-bold uppercase">Gestione di un negozio esistente</p>
                    <h2 className="text-lg font-black leading-tight">{r.shops.name}</h2>
                    <p className="text-sm">{[r.shops.city, r.shops.province].filter(Boolean).join(" ")}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold uppercase">Nuovo negozio</p>
                    <h2 className="text-lg font-black leading-tight">{p?.name}</h2>
                    <p className="text-sm">
                      {[p?.address, [p?.city, p?.province].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                    </p>
                    {p?.phone && <p className="text-sm">{p.phone}</p>}
                    {p?.website && <p className="break-all text-sm">{p.website}</p>}
                    {p?.description && <p className="whitespace-pre-line text-sm">{p.description}</p>}
                  </>
                )}

                <form action={approveRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="brutal-btn w-full bg-brand-green">
                    Approva
                  </button>
                </form>
                <form action={rejectRequest} className="space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    name="note"
                    maxLength={300}
                    placeholder="Motivo del rifiuto (facoltativo)"
                    aria-label="Motivo del rifiuto"
                    className="block w-full border-[3px] border-ink bg-white px-3 py-2"
                  />
                  <button type="submit" className="brutal-btn w-full bg-brand-red">
                    Rifiuta
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function AdminRequestsPage({ searchParams }: PageProps<"/admin/richieste">) {
  return (
    <>
      <PageHeader title="Richieste negozi" subtitle="Area admin" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <Requests searchParams={searchParams as Promise<{ errore?: string }>} />
      </Suspense>
    </>
  );
}
