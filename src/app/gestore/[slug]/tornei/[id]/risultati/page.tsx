import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ImageActions } from "@/components/image-actions";
import { createClient } from "@/lib/supabase/server";
import { canManageShop } from "@/lib/shop-access";
import type { LeaderOpt } from "@/app/onepiece/risultati/track/leader-picker";
import { ResultForm } from "./result-form";
import { deleteResult } from "./actions";

type ResultRow = {
  id: string;
  player_name: string;
  leader_code: string;
  placement: number | null;
  wins: number;
  losses: number;
};

const SLUG = /^[a-z0-9-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Results({ params }: { params: Promise<{ slug: string; id: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { slug, id } = await params;
  if (!SLUG.test(slug) || !UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) notFound();
  if (!(await canManageShop(supabase, shop.id, auth.user?.id ?? ""))) notFound();

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, title")
    .eq("id", id)
    .eq("shop_id", shop.id)
    .maybeSingle()
    .overrideTypes<{ id: string; title: string }, { merge: false }>();
  if (!t) notFound();

  const op = supabase.schema("onepiece");
  const [{ data: results }, { data: leaders }] = await Promise.all([
    op
      .from("tournament_results")
      .select("id, player_name, leader_code, placement, wins, losses")
      .eq("tournament_id", id)
      .order("placement", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .overrideTypes<ResultRow[], { merge: false }>(),
    op
      .from("leaders")
      .select("card_code, name, image_path, meta_position")
      .order("card_code")
      .overrideTypes<LeaderOpt[], { merge: false }>(),
  ]);

  const leaderName = new Map((leaders ?? []).map((l) => [l.card_code, l.name]));

  return (
    <main className="space-y-6 p-4">
      <Link href={`/gestore/${slug}/tornei/${id}`} className="inline-block text-sm font-bold underline">
        ← {t.title}
      </Link>

      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">Risultati salvati</h2>
        {(results ?? []).length === 0 ? (
          <p className="text-sm">Nessun risultato inserito.</p>
        ) : (
          <ul className="space-y-4">
            {(results ?? []).map((r) => (
              <li key={r.id} className="space-y-2">
                <div className="brutal-card flex items-start justify-between gap-2 p-3">
                  <div>
                    <p className="font-black leading-tight">{r.player_name}</p>
                    <p className="text-sm">
                      {r.leader_code} · {leaderName.get(r.leader_code) ?? ""}
                    </p>
                    <p className="text-xs font-bold">
                      {r.placement ? `${r.placement}° · ` : ""}
                      {r.wins}V · {r.losses}S
                    </p>
                  </div>
                  <form action={deleteResult.bind(null, slug, id)}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="border-2 border-ink bg-brand-red px-2 py-1 text-xs font-black uppercase">
                      Elimina
                    </button>
                  </form>
                </div>
                <ImageActions kind="torneo" id={r.id} title={`Immagine di ${r.player_name}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">Nuovo risultato</h2>
        <ResultForm slug={slug} tournamentId={id} leaders={leaders ?? []} />
      </section>
    </main>
  );
}

export default function TournamentResultsPage({ params }: PageProps<"/gestore/[slug]/tornei/[id]/risultati">) {
  return (
    <>
      <PageHeader title="Risultati" subtitle="Torneo" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <Results params={params} />
      </Suspense>
    </>
  );
}
