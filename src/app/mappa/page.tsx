import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { ShopsMap, type MapShop } from "./shops-map";

type ShopRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  lat: number;
  lng: number;
};

async function MapLoader() {
  await connection(); // usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [shopsRes, tournamentsRes] = await Promise.all([
    supabase
      .from("shops")
      .select("id, slug, name, city, province, lat, lng")
      .eq("status", "approved")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .limit(500)
      .overrideTypes<ShopRow[], { merge: false }>(),
    supabase
      .from("tournaments")
      .select("shop_id, starts_at")
      .eq("status", "scheduled")
      .gte("starts_at", now)
      .not("shop_id", "is", null)
      .order("starts_at", { ascending: true })
      .limit(1000),
  ]);

  if (shopsRes.error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare la mappa. Riprova più tardi.
        </p>
      </main>
    );
  }

  // Primo torneo in programma per ogni negozio (i risultati sono già ordinati per data).
  const nextByShop = new Map<string, string>();
  for (const t of tournamentsRes.data ?? []) {
    if (t.shop_id && !nextByShop.has(t.shop_id)) nextByShop.set(t.shop_id, t.starts_at);
  }

  const shops: MapShop[] = (shopsRes.data ?? []).map((s) => ({ ...s, next_at: nextByShop.get(s.id) ?? null }));

  return <ShopsMap shops={shops} />;
}

export default function MappaPage() {
  return (
    <>
      <PageHeader title="Mappa" subtitle="Negozi vicino a te" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <MapLoader />
      </Suspense>
    </>
  );
}
