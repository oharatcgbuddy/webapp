import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { TournamentCards, type TournamentItem } from "./tournament-cards";

async function TournamentList({
  searchParams,
}: {
  searchParams: Promise<{ provincia?: string; tipo?: string }>;
}) {
  await connection(); // usa l'ora corrente: niente prerender
  const { provincia, tipo } = await searchParams;
  // I Regionals (tornei senza negozio, caricati dall'admin) si vedono solo con il filtro "Regionals".
  const regionals = tipo === "regionals";
  const province = regionals ? undefined : provincia?.trim().toUpperCase().slice(0, 2);

  const supabase = await createClient();
  let query = supabase
    .from("tournaments")
    .select(
      `id, title, starts_at, entry_fee_cents, max_players, format_slug, kind, venue,
       shops${province ? "!inner" : ""} (name, city, province, lat, lng, logo_url),
       tcgs!inner (slug)`,
    )
    .eq("tcgs.slug", "onepiece")
    .eq("kind", regionals ? "regional" : "shop")
    .eq("status", "scheduled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);
  if (province) query = query.eq("shops.province", province);

  const { data, error } = await query.overrideTypes<TournamentItem[], { merge: false }>();

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare i tornei. Riprova più tardi.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-4">
      <TournamentCards
        items={data ?? []}
        regionals={regionals}
        province={province ?? ""}
        emptyHint={
          regionals
            ? "Nessun Regional in programma: torna a controllare presto."
            : province
              ? "Prova a togliere il filtro provincia."
              : "Torna a controllare presto."
        }
      />
    </main>
  );
}

export default function TorneiPage({ searchParams }: PageProps<"/onepiece">) {
  return (
    <>
      <PageHeader title="Tornei" subtitle="Prossimi tornei, per data" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <TournamentList searchParams={searchParams as Promise<{ provincia?: string; tipo?: string }>} />
      </Suspense>
    </>
  );
}
