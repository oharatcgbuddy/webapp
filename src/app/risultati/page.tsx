import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { computeStats, winRate, type Bucket, type MatchStat } from "@/lib/onepiece/stats";

type Row = {
  id: string;
  played_on: string;
  standalone_label: string | null;
  placement: number | null;
  players_count: number | null;
  wins: number;
  losses: number;
  draws: number;
  tournaments: { title: string } | null;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

function BucketList({ title, rows, names }: { title: string; rows: Bucket[]; names: Map<string, string> }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-black uppercase">{title}</h3>
      <ul className="space-y-1">
        {rows.slice(0, 5).map((b) => (
          <li key={b.code} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              {b.code} · {names.get(b.code) ?? ""}
            </span>
            <span className="shrink-0 font-bold">
              {winRate(b)}% <span className="font-normal">({b.wins}-{b.losses}-{b.draws})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Results() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const op = supabase.schema("onepiece");

  const { data, error } = await supabase
    .from("participations")
    .select("id, played_on, standalone_label, placement, players_count, wins, losses, draws, tournaments(title)")
    .eq("user_id", auth.user?.id ?? "")
    .not("closed_at", "is", null) // i track in corso si vedono solo in /risultati/track
    .order("played_on", { ascending: false })
    .limit(100)
    .overrideTypes<Row[], { merge: false }>();

  if (error) {
    return (
      <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
        Impossibile caricare i risultati. Riprova più tardi.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="brutal-card p-4">
        <p className="font-bold">Nessun risultato ancora</p>
        <p className="text-sm">Avvia un track o aggiungi un torneo a posteriori con i tasti qui sopra.</p>
      </div>
    );
  }

  // Statistiche: record dai risultati, il resto dai round tracciati.
  const ids = data.map((r) => r.id);
  const [{ data: matchData }, { data: detailData }, { data: leaderData }] = await Promise.all([
    op
      .from("matches")
      .select("participation_id, result, won_dice, opponent_leader_code")
      .in("participation_id", ids)
      .overrideTypes<MatchStat[], { merge: false }>(),
    op.from("participation_details").select("participation_id, leader_code").in("participation_id", ids),
    op.from("leaders").select("card_code, name"),
  ]);

  const stats = computeStats(
    matchData ?? [],
    new Map((detailData ?? []).map((d) => [d.participation_id, d.leader_code as string | null])),
  );
  const names = new Map((leaderData ?? []).map((l) => [l.card_code, l.name]));
  const total = data.reduce(
    (acc, r) => ({ w: acc.w + r.wins, l: acc.l + r.losses, d: acc.d + r.draws }),
    { w: 0, l: 0, d: 0 },
  );
  const totalGames = total.w + total.l + total.d;

  return (
    <>
      <section className="brutal-card space-y-3 p-4">
        <h2 className="text-lg font-black uppercase">Statistiche</h2>
        <p className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="border-2 border-ink bg-brand-green px-2 py-1">
            {total.w}V · {total.l}S · {total.d}P
          </span>
          {totalGames > 0 && (
            <span className="border-2 border-ink bg-brand-yellow px-2 py-1">
              Win rate {winRate({ games: totalGames, wins: total.w })}%
            </span>
          )}
          {stats.diceKnown > 0 && (
            <span className="border-2 border-ink bg-white px-2 py-1">
              Dado vinto {Math.round((100 * stats.diceWon) / stats.diceKnown)}%
            </span>
          )}
        </p>
        <BucketList title="Con i tuoi leader" rows={stats.byMyLeader} names={names} />
        <BucketList title="Contro i leader più incontrati" rows={stats.byOpponent} names={names} />
        {stats.games === 0 && (
          <p className="text-xs">Le statistiche per leader compaiono dopo il primo track con i round.</p>
        )}
      </section>

      <ul className="space-y-4">
        {data.map((r) => (
          <li key={r.id} className="brutal-card p-4">
            <p className="text-sm font-bold uppercase">{dateFmt.format(new Date(r.played_on))}</p>
            <h2 className="text-lg font-black leading-tight">
              <Link href={`/risultati/${r.id}`} className="underline decoration-[3px]">
                {r.tournaments?.title ?? r.standalone_label}
              </Link>
            </h2>
            <p className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              <span className="border-2 border-ink bg-brand-green px-2 py-1">
                {r.wins}V · {r.losses}S · {r.draws}P
              </span>
              {r.placement && (
                <span className="border-2 border-ink bg-brand-yellow px-2 py-1">
                  {r.placement}° {r.players_count ? `su ${r.players_count}` : ""}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function RisultatiPage() {
  return (
    <>
      <PageHeader title="Miei risultati" subtitle="Storico e statistiche" />
      <main className="space-y-4 p-4">
        <Link href="/risultati/track" className="brutal-btn w-full bg-brand-green">
          ▶ Track torneo live
        </Link>
        <Link href="/risultati/nuovo" className="brutal-btn w-full bg-white">
          + Aggiungi a posteriori
        </Link>
        <Suspense fallback={<p>Caricamento…</p>}>
          <Results />
        </Suspense>
      </main>
    </>
  );
}
