import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { ChangeDeck, type DeckOption } from "../change-deck";
import { CloseForm } from "./close-form";
import { RoundForm } from "./round-form";
import { StartForm } from "./start-form";
import { undoLastRound } from "./actions";

type OpenTrack = {
  id: string;
  standalone_label: string | null;
  tournaments: { title: string } | null;
};

type MatchRow = {
  round: number;
  opponent_leader_code: string | null;
  won_dice: boolean | null;
  result: "win" | "loss" | "bye";
  notes: string | null;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const RESULT = {
  win: { text: "Vinto", cls: "bg-brand-green" },
  loss: { text: "Perso", cls: "bg-brand-red" },
  bye: { text: "BYE", cls: "bg-brand-pink" },
} as const;

async function TrackLoader() {
  await connection(); // usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) {
    return <main className="p-4">Accedi per usare il track.</main>;
  }

  const op = supabase.schema("onepiece");

  const [{ data: leaders }, { data: open, error }] = await Promise.all([
    op.from("leaders").select("card_code, name, image_path, meta_position").order("card_code"),
    supabase
      .from("participations")
      .select("id, standalone_label, tournaments(title)")
      .eq("user_id", uid)
      .is("closed_at", null)
      .maybeSingle()
      .overrideTypes<OpenTrack, { merge: false }>(),
  ]);

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare il track. Riprova più tardi.
        </p>
      </main>
    );
  }

  const allLeaders = leaders ?? [];

  // --- Nessun track aperto: form di avvio ---
  if (!open) {
    const nowDate = new Date();
    const from = new Date(nowDate.getTime() - 24 * 3600 * 1000).toISOString();
    const to = new Date(nowDate.getTime() + 12 * 3600 * 1000).toISOString();

    const [{ data: tournaments }, { data: decks }, { data: shops }] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, title, starts_at")
        .gte("starts_at", from)
        .lte("starts_at", to)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true })
        .limit(50),
      op.from("decks").select("id, name").eq("owner_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("shops").select("id, name, city").eq("status", "approved").order("name").limit(500),
    ]);

    return (
      <StartForm
        tournaments={(tournaments ?? []).map((t) => ({
          id: t.id,
          label: `${dateFmt.format(new Date(t.starts_at))} · ${t.title}`,
        }))}
        leaders={allLeaders}
        decks={decks ?? []}
        shops={(shops ?? []).map((s) => ({ id: s.id, label: s.city ? `${s.name} (${s.city})` : s.name }))}
      />
    );
  }

  // --- Track aperto ---
  const [{ data: details }, { data: matchData }, { data: myDecks }] = await Promise.all([
    op.from("participation_details").select("leader_code, deck_id").eq("participation_id", open.id).maybeSingle(),
    op
      .from("matches")
      .select("round, opponent_leader_code, won_dice, result, notes")
      .eq("participation_id", open.id)
      .order("round", { ascending: true })
      .overrideTypes<MatchRow[], { merge: false }>(),
    op
      .from("decks")
      .select("id, name, leader_code")
      .eq("owner_id", uid)
      .order("created_at", { ascending: false })
      .limit(100)
      .overrideTypes<DeckOption[], { merge: false }>(),
  ]);

  const matches = matchData ?? [];
  const names = new Map(allLeaders.map((l) => [l.card_code, l.name]));
  const count = (r: MatchRow["result"]) => matches.filter((m) => m.result === r).length;
  const myLeader = details?.leader_code ?? null;

  return (
    <main className="space-y-4 p-4">
      <section className="brutal-card space-y-1 p-4">
        <p className="text-xs font-bold uppercase">Track in corso</p>
        <h2 className="text-xl font-black leading-tight">{open.tournaments?.title ?? open.standalone_label}</h2>
        {myLeader && (
          <p className="text-sm font-bold">
            {myLeader} · {names.get(myLeader) ?? ""}
          </p>
        )}
        <p className="mt-2 inline-block border-2 border-ink bg-brand-yellow px-2 py-1 text-sm font-bold">
          {count("win") + count("bye")}V · {count("loss")}S
        </p>
      </section>

      {matches.length > 0 && (
        <section className="space-y-2">
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.round} className="brutal-card flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-xs font-bold uppercase">Round {m.round}</p>
                  <p className="font-bold leading-tight">
                    {m.opponent_leader_code
                      ? `${m.opponent_leader_code} · ${names.get(m.opponent_leader_code) ?? ""}`
                      : m.result === "bye"
                        ? "Nessun avversario"
                        : "Avversario n/d"}
                  </p>
                  {m.won_dice !== null && (
                    <p className="text-xs">Dado {m.won_dice ? "vinto" : "perso"}</p>
                  )}
                  {m.notes && <p className="mt-1 text-sm italic">{m.notes}</p>}
                </div>
                <span className={`border-2 border-ink px-2 py-1 text-xs font-black uppercase ${RESULT[m.result].cls}`}>
                  {RESULT[m.result].text}
                </span>
              </li>
            ))}
          </ul>
          <form action={undoLastRound}>
            <button type="submit" className="text-sm font-bold underline">
              Annulla ultimo round
            </button>
          </form>
        </section>
      )}

      <RoundForm key={matches.length + 1} round={matches.length + 1} leaders={allLeaders} />

      <ChangeDeck participationId={open.id} currentDeckId={details?.deck_id ?? null} decks={myDecks ?? []} />

      <CloseForm />
    </main>
  );
}

export default function TrackPage() {
  return (
    <>
      <PageHeader title="Track torneo" subtitle="One Piece, round per round" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <TrackLoader />
      </Suspense>
    </>
  );
}
