import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ImageActions } from "@/components/image-actions";
import { createClient } from "@/lib/supabase/server";
import { canManageShop } from "@/lib/shop-access";

type PlayerRow = { participation_id: string; player_name: string; manual_result: boolean };

type Part = {
  id: string;
  played_on: string;
  placement: number | null;
  players_count: number | null;
  wins: number;
  losses: number;
};

type MatchRow = {
  round: number;
  opponent_leader_code: string | null;
  won_dice: boolean | null;
  result: "win" | "loss" | "bye";
};

const SLUG = /^[a-z0-9-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESULT = {
  win: { text: "Vinto", cls: "bg-brand-green" },
  loss: { text: "Perso", cls: "bg-brand-red" },
  bye: { text: "BYE", cls: "bg-brand-pink" },
} as const;

// Dettaglio di un risultato registrato da un giocatore su un torneo del negozio: sola lettura, con le immagini.
async function PlayerResult({ params }: { params: Promise<{ slug: string; id: string; pid: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { slug, id, pid } = await params;
  if (!SLUG.test(slug) || !UUID.test(id) || !UUID.test(pid)) notFound();

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

  // Il nome arriva solo se il risultato è visibile al negozio (non nascosto dal giocatore).
  const { data: playerData } = await supabase.rpc("shop_tournament_players", { p_tournament: id });
  const player = ((playerData ?? []) as PlayerRow[]).find((r) => r.participation_id === pid);
  if (!player) notFound();

  const op = supabase.schema("onepiece");
  const [{ data: part }, { data: details }, { data: matchData }] = await Promise.all([
    supabase
      .from("participations")
      .select("id, played_on, placement, players_count, wins, losses")
      .eq("id", pid)
      .maybeSingle()
      .overrideTypes<Part, { merge: false }>(),
    op.from("participation_details").select("leader_code, deck_id").eq("participation_id", pid).maybeSingle(),
    op
      .from("matches")
      .select("round, opponent_leader_code, won_dice, result")
      .eq("participation_id", pid)
      .order("round", { ascending: true })
      .overrideTypes<MatchRow[], { merge: false }>(),
  ]);
  if (!part) notFound();

  const matches = matchData ?? [];
  const codes = [...new Set([details?.leader_code, ...matches.map((m) => m.opponent_leader_code)].filter((c): c is string => !!c))];
  const [{ data: leaders }, { data: deck }, { data: deckCards }] = await Promise.all([
    codes.length > 0
      ? op.from("leaders").select("card_code, name").in("card_code", codes)
      : Promise.resolve({ data: [] as { card_code: string; name: string }[] }),
    details?.deck_id
      ? op.from("decks").select("name, decklist_text").eq("id", details.deck_id).maybeSingle()
      : Promise.resolve({ data: null }),
    details?.deck_id
      ? op.from("deck_cards").select("qty").eq("deck_id", details.deck_id)
      : Promise.resolve({ data: null }),
  ]);

  const names = new Map((leaders ?? []).map((l) => [l.card_code, l.name]));
  const label = (code: string | null) => (code ? `${code} · ${names.get(code) ?? ""}` : null);
  const totalCards = (deckCards ?? []).reduce((sum, c) => sum + c.qty, 0);

  return (
    <main className="space-y-4 p-4">
      <Link href={`/gestore/${slug}/tornei/${id}/risultati`} className="inline-block text-sm font-bold underline">
        ← Risultati di {t.title}
      </Link>

      <section className="brutal-card space-y-1 p-4">
        <h2 className="text-2xl font-black leading-tight">{player.player_name}</h2>
        {label(details?.leader_code ?? null) && (
          <p className="text-sm font-bold">Leader: {label(details?.leader_code ?? null)}</p>
        )}
        <p className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
          <span className="border-2 border-ink bg-brand-green px-2 py-1">
            {part.wins}V · {part.losses}S
          </span>
          {part.placement && (
            <span className="border-2 border-ink bg-brand-yellow px-2 py-1">
              {part.placement}° {part.players_count ? `su ${part.players_count}` : ""}
            </span>
          )}
        </p>
      </section>

      {details?.leader_code && <ImageActions kind="risultato" id={pid} title={`Immagine di ${player.player_name}`} />}

      <section className="space-y-2">
        <h3 className="font-black uppercase">Round</h3>
        {matches.length === 0 ? (
          <p className="text-sm">Il giocatore non ha registrato i round.</p>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.round} className="brutal-card flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-xs font-bold uppercase">Round {m.round}</p>
                  <p className="font-bold leading-tight">
                    {m.result === "bye" ? "Nessun avversario" : (label(m.opponent_leader_code) ?? "Avversario n/d")}
                  </p>
                  {m.won_dice !== null && <p className="text-xs">Dado {m.won_dice ? "vinto" : "perso"}</p>}
                </div>
                <span className={`border-2 border-ink px-2 py-1 text-xs font-black uppercase ${RESULT[m.result].cls}`}>
                  {RESULT[m.result].text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deck && (
        <section className="brutal-card space-y-2 p-4">
          <h3 className="font-black uppercase">Decklist</h3>
          <p className="text-sm font-bold">
            {deck.name} · {totalCards} carte
          </p>
          {deck.decklist_text && (
            <details>
              <summary className="cursor-pointer text-sm font-bold underline">Mostra lista</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs">{deck.decklist_text}</pre>
            </details>
          )}
        </section>
      )}
    </main>
  );
}

export default function PlayerResultPage({ params }: { params: Promise<{ slug: string; id: string; pid: string }> }) {
  return (
    <>
      <PageHeader title="Risultato" subtitle="Registrato dal giocatore" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <PlayerResult params={params} />
      </Suspense>
    </>
  );
}
