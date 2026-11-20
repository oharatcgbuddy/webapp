import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/shop-access";

type Row = {
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  status: "pending" | "approved" | "rejected";
  lat: number | null;
  shop_members: { count: number }[];
};

const STATUS = {
  approved: { text: "Approvato", cls: "bg-brand-green" },
  pending: { text: "In attesa", cls: "bg-brand-yellow" },
  rejected: { text: "Rifiutato", cls: "bg-brand-red" },
} as const;

async function Shops({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { q: rawQ } = await searchParams;
  // Via i caratteri che hanno un significato nel filtro di PostgREST o nel LIKE.
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "").replace(/[,()%_*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  // Pagina riservata agli admin: per gli altri non esiste.
  if (!(await isAdmin(supabase, auth.user?.id ?? ""))) notFound();

  let query = supabase
    .from("shops")
    .select("slug, name, city, province, status, lat, shop_members(count)")
    .order("name")
    .limit(300);
  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,slug.ilike.%${q}%`);
  const { data, error } = await query.overrideTypes<Row[], { merge: false }>();

  if (error) {
    return (
      <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
        Impossibile caricare i negozi. Riprova più tardi.
      </p>
    );
  }

  const shops = data ?? [];
  return (
    <>
      <form action="/admin/negozi" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={60}
          placeholder="Cerca per nome, città o slug"
          aria-label="Cerca un negozio"
          className="block min-w-0 flex-1 border-[3px] border-ink bg-white px-3 py-2"
        />
        <button type="submit" className="brutal-btn bg-brand-yellow px-4">
          Cerca
        </button>
      </form>
      <p className="text-sm font-medium">
        {shops.length} negozi{q ? ` per "${q}"` : ""}
        {q && (
          <>
            {" · "}
            <Link href="/admin/negozi" className="underline">
              Azzera
            </Link>
          </>
        )}
      </p>
      {shops.length === 0 ? (
        <p className="brutal-card p-4 text-sm">{q ? "Nessun negozio trovato." : "Nessun negozio ancora."}</p>
      ) : (
        <ul className="space-y-3">
          {shops.map((s) => {
            const owners = s.shop_members[0]?.count ?? 0;
            return (
              <li key={s.slug} className="brutal-card space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/admin/negozi/${s.slug}`} className="font-black underline decoration-[3px]">
                      {s.name}
                    </Link>
                    <p className="text-sm">{[s.city, s.province].filter(Boolean).join(" ")}</p>
                  </div>
                  <span className={`shrink-0 border-2 border-ink px-2 py-1 text-xs font-black uppercase ${STATUS[s.status].cls}`}>
                    {STATUS[s.status].text}
                  </span>
                </div>
                <p className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className={`border-2 border-ink px-2 py-1 ${owners === 0 ? "bg-brand-yellow" : "bg-white"}`}>
                    {owners === 0 ? "Nessun gestore" : owners === 1 ? "1 gestore" : `${owners} gestori`}
                  </span>
                  {s.lat === null && <span className="border-2 border-ink bg-brand-yellow px-2 py-1">Senza posizione</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function AdminShopsPage({ searchParams }: PageProps<"/admin/negozi">) {
  return (
    <>
      <PageHeader title="Negozi" subtitle="Area admin" />
      <main className="space-y-4 p-4">
        <Link href="/admin/negozi/nuovo" className="brutal-btn w-full bg-brand-green">
          + Nuovo negozio
        </Link>
        <Suspense fallback={<p>Caricamento…</p>}>
          <Shops searchParams={searchParams as Promise<{ q?: string | string[] }>} />
        </Suspense>
      </main>
    </>
  );
}
