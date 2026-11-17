import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

type Membership = {
  role: "owner" | "staff";
  shops: { name: string; slug: string; city: string | null; province: string | null; status: string } | null;
};

async function ShopList() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("shop_members")
    .select("role, shops(name, slug, city, province, status)")
    .eq("user_id", auth.user?.id ?? "")
    .overrideTypes<Membership[], { merge: false }>();

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare i tuoi negozi. Riprova più tardi.
        </p>
      </main>
    );
  }

  const shops = (data ?? []).filter((m) => m.shops);

  return (
    <main className="space-y-4 p-4">
      {shops.length === 0 ? (
        <div className="brutal-card space-y-2 p-4">
          <p className="font-bold">Non gestisci ancora nessun negozio</p>
          <Link href="/negozi/richiesta" className="underline">
            Invia una richiesta di gestione
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {shops.map((m) => (
            <li key={m.shops!.slug} className="brutal-card p-4">
              <p className="text-xs font-bold uppercase">{m.role === "owner" ? "Proprietario" : "Staff"}</p>
              <h2 className="text-xl font-black leading-tight">
                <Link href={`/gestore/${m.shops!.slug}`} className="underline decoration-[3px]">
                  {m.shops!.name}
                </Link>
              </h2>
              <p className="text-sm">{[m.shops!.city, m.shops!.province].filter(Boolean).join(" ")}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function GestorePage() {
  return (
    <>
      <PageHeader title="Area gestore" subtitle="I tuoi negozi" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <ShopList />
      </Suspense>
    </>
  );
}
