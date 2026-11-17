import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { TournamentCards, type TournamentItem } from "./tournament-cards";

async function TournamentList({
  searchParams,
}: {
  searchParams: Promise<{ provincia?: string }>;
}) {
  await connection(); // usa l'ora corrente: niente prerender
  const { provincia } = await searchParams;
  const province = provincia?.trim().toUpperCase().slice(0, 2);

  const supabase = await createClient();
  let query = supabase
    .from("tournaments")
    .select(
      `id, title, starts_at, entry_fee_cents, max_players, format_slug,
       shops${province ? "!inner" : ""} (name, city, province, lat, lng),
       tcgs!inner (slug)`,
    )
    .eq("tcgs.slug", "onepiece")
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
      <form className="brutal-card flex items-end gap-2 p-3" action="/">
        <label className="flex-1 text-sm font-bold">
          Provincia
          <input
            name="provincia"
            defaultValue={province ?? ""}
            maxLength={2}
            placeholder="es. MI"
            className="mt-1 block w-full border-[3px] border-ink px-2 py-2 uppercase"
          />
        </label>
        <button type="submit" className="brutal-btn">
          Filtra
        </button>
      </form>

      <TournamentCards
        items={data ?? []}
        emptyHint={province ? "Prova a togliere il filtro provincia." : "Torna a controllare presto."}
      />
    </main>
  );
}

export default function TorneiPage({ searchParams }: PageProps<"/onepiece">) {
  return (
    <>
      <PageHeader title="Tornei" subtitle="Prossimi tornei, per data" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <TournamentList searchParams={searchParams as Promise<{ provincia?: string }>} />
      </Suspense>
    </>
  );
}
