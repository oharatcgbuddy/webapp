import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { DeleteButton } from "./delete-button";

type Detail = {
  id: string;
  user_id: string;
  played_on: string;
  standalone_label: string | null;
  placement: number | null;
  players_count: number | null;
  wins: number;
  losses: number;
  draws: number;
  notes: string | null;
  closed_at: string | null;
  tournaments: { id: string; title: string } | null;
};

type MatchRow = {
  round: number;
  opponent_leader_code: string | null;
  opponent_name: string | null;
  won_dice: boolean | null;
  result: "win" | "loss" | "draw";
  notes: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" });

const RESULT = {
  win: { text: "Vinto", cls: "bg-brand-green" },
  loss: { text: "Perso", cls: "bg-brand-red" },
  draw: { text: "Pari", cls: "bg-brand-yellow" },
} as const;

async function ResultDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const op = supabase.schema("onepiece");

  const [{ data: auth }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("participations")
      .select(
        "id, user_id, played_on, standalone_label, placement, players_count, wins, losses, draws, notes, closed_at, tournaments(id, title)",
      )
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<Detail, { merge: false }>(),
  ]);

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare il risultato. Riprova più tardi.
        </p>
      </main>
    );
  }
  if (!data) notFound();

  const isOwner = auth.user?.id === data.user_id;
  if (!data.closed_at && isOwner) redirect("/risultati/track");

  const [{ data: details }, { data: matchData }] = await Promise.all([
    op.from("participation_details").select("leader_code, deck_id").eq("participation_id", id).maybeSingle(),
    op
      .from("matches")
      .select("round, opponent_leader_code, opponent_name, won_dice, result, notes")
      .eq("participation_id", id)
      .order("round", { ascending: true })
      .overrideTypes<MatchRow[], { merge: false }>(),
  ]);

  const matches = matchData ?? [];
  const codes = [
    ...new Set([details?.leader_code, ...matches.map((m) => m.opponent_leader_code)].filter((c): c is string => !!c)),
  ];

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
  const diceKnown = matches.filter((m) => m.won_dice !== null);

  return (
    <main className="space-y-4 p-4">
      <section className="brutal-card space-y-1 p-4">
        <p className="text-sm font-bold uppercase">{dateFmt.format(new Date(data.played_on))}</p>
        <h2 className="text-2xl font-black leading-tight">{data.tournaments?.title ?? data.standalone_label}</h2>
        {label(details?.leader_code ?? null) && (
          <p className="text-sm font-bold">Leader: {label(details?.leader_code ?? null)}</p>
        )}
        <p className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
          <span className="border-2 border-ink bg-brand-green px-2 py-1">
            {data.wins}V · {data.losses}S · {data.draws}P
          </span>
          {data.placement && (
            <span className="border-2 border-ink bg-brand-yellow px-2 py-1">
              {data.placement}° {data.players_count ? `su ${data.players_count}` : ""}
            </span>
          )}
          {diceKnown.length > 0 && (
            <span className="border-2 border-ink bg-white px-2 py-1">
              Dado vinto {diceKnown.filter((m) => m.won_dice).length}/{diceKnown.length}
            </span>
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-black uppercase">Round</h3>
        {matches.length === 0 ? (
          <p className="text-sm">Nessun round registrato per questo torneo.</p>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.round} className="brutal-card flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-xs font-bold uppercase">Round {m.round}</p>
                  <p className="font-bold leading-tight">
                    {label(m.opponent_leader_code) ?? m.opponent_name ?? "Avversario n/d"}
                  </p>
                  {m.won_dice !== null && <p className="text-xs">Dado {m.won_dice ? "vinto" : "perso"}</p>}
                  {m.notes && <p className="mt-1 text-sm italic">{m.notes}</p>}
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

      {data.notes && (
        <section className="brutal-card p-4">
          <h3 className="font-black uppercase">Note</h3>
          <p className="whitespace-pre-line">{data.notes}</p>
        </section>
      )}

      {isOwner && <DeleteButton id={data.id} />}
    </main>
  );
}

export default function ResultPage({ params }: PageProps<"/risultati/[id]">) {
  return (
    <>
      <PageHeader title="Risultato" subtitle="Dettaglio torneo" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <ResultDetail params={params} />
      </Suspense>
    </>
  );
}
