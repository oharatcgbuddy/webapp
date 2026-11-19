// Costruisce i dati da mandare al servizio immagini a partire dal database, sempre con la sessione
// dell'utente: le regole del database (RLS) decidono cosa può vedere.
//
// Tre sorgenti:
//  - mazzo del deckbuilder (solo il proprietario)
//  - risultato tracciato da un giocatore (partecipazione chiusa, solo il proprietario): tutto automatico
//  - risultato inserito dal negozio per un torneo (tabella tournament_results)

import type { createClient } from "@/lib/supabase/server";
import type { ImageBody, ImageCard, ImageMatchup } from "@/lib/image-api";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Op = ReturnType<Supabase["schema"]>;
export type Built = { ok: true; body: ImageBody; file: string } | { ok: false; status: number; error: string };

type CardRow = { card_code: string; name: string; type: string | null; colors: string[]; cost: number | null; counter: number | null; image_path: string | null };
type LeaderRow = { card_code: string; name: string; colors: string[]; image_path: string | null };
type ShopRow = { name: string; logo_url: string | null };

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });
const fmtDate = (iso: string) => dateFmt.format(new Date(iso)).replace(/\./g, "");

const fail = (status: number, error: string): Built => ({ ok: false, status, error });

async function cardsFor(op: Op, entries: { code: string; qty: number }[]): Promise<ImageCard[]> {
  const codes = [...new Set(entries.map((e) => e.code))];
  if (codes.length === 0) return [];
  const { data } = await op
    .from("cards")
    .select("card_code, name, type, colors, cost, counter, image_path")
    .in("card_code", codes)
    .overrideTypes<CardRow[], { merge: false }>();
  const byCode = new Map((data ?? []).map((c) => [c.card_code, c]));
  return entries.map((e) => {
    const c = byCode.get(e.code);
    return {
      code: e.code,
      qty: Math.min(4, Math.max(1, e.qty)),
      name: c?.name ?? null,
      cost: c?.cost ?? null,
      type: c?.type ?? null,
      colors: c?.colors ?? [],
      counter: c?.counter ?? null,
      image_path: c?.image_path ?? null,
    };
  });
}

async function leadersFor(op: Op, codes: (string | null | undefined)[]): Promise<Map<string, LeaderRow>> {
  const list = [...new Set(codes.filter((c): c is string => !!c))];
  if (list.length === 0) return new Map();
  const { data } = await op
    .from("leaders")
    .select("card_code, name, colors, image_path")
    .in("card_code", list)
    .overrideTypes<LeaderRow[], { merge: false }>();
  return new Map((data ?? []).map((l) => [l.card_code, l]));
}

type RawMatch = {
  round: number | null;
  opponent_leader_code?: string | null;
  opponent_code?: string | null;
  opponent_name: string | null;
  won_dice?: boolean | null;
  dice_won?: boolean | null;
  result: string;
};

function toMatchups(raw: RawMatch[], leaders: Map<string, LeaderRow>): ImageMatchup[] {
  return raw.slice(0, 16).map((m) => {
    const code = m.opponent_leader_code ?? m.opponent_code ?? null;
    const l = code ? leaders.get(code) : undefined;
    const result = m.result === "win" || m.result === "loss" || m.result === "bye" ? m.result : "loss";
    return {
      round: m.round,
      opponent_code: l ? code : null,
      opponent_name: l?.name ?? m.opponent_name,
      opponent_colors: l?.colors ?? [],
      opponent_image_path: l?.image_path ?? null,
      dice_won: result === "bye" ? null : (m.won_dice ?? m.dice_won ?? null),
      result,
    };
  });
}

// Il risultato dipende dalle sconfitte: nessuna = "WINNER", altrimenti "X-1", "X-2"… (il numero dopo la X sono le sconfitte).
function resultLabels(losses: number, placement: number | null, players: number | null) {
  const winner = losses === 0;
  return {
    result_label: winner ? "WINNER" : `X-${losses}`,
    result_winner: winner,
    placement_text: placement ? `${placement}° ${players ? `su ${players}` : ""}`.trim() : null,
  };
}

const shopOf = (s: ShopRow | null | undefined) => (s ? { name: s.name, logo_path: s.logo_url } : null);

export async function buildDeckImage(supabase: Supabase, id: string): Promise<Built> {
  const op = supabase.schema("onepiece");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail(401, "Accedi per creare l'immagine.");

  const { data: deck } = await op
    .from("decks")
    .select("id, name, leader_code")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle()
    .overrideTypes<{ id: string; name: string; leader_code: string | null }, { merge: false }>();
  if (!deck?.leader_code) return fail(404, "Mazzo non trovato.");

  const [leaders, { data: rows }] = await Promise.all([
    leadersFor(op, [deck.leader_code]),
    op.from("deck_cards").select("card_code, qty").eq("deck_id", id),
  ]);
  const leader = leaders.get(deck.leader_code);
  if (!leader) return fail(404, "Leader non trovato.");

  const cards = await cardsFor(op, (rows ?? []).map((r) => ({ code: r.card_code, qty: r.qty })));
  return {
    ok: true,
    file: `mazzo-${deck.leader_code}`,
    body: {
      kind: "deck",
      title: deck.name,
      leader: { code: leader.card_code, name: leader.name, colors: leader.colors, image_path: leader.image_path },
      cards,
    },
  };
}

// Risultato tracciato dal giocatore: piazzamento, record, mazzo e scontri vengono dalla partecipazione.
export async function buildParticipationImage(supabase: Supabase, id: string): Promise<Built> {
  const op = supabase.schema("onepiece");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail(401, "Accedi per creare l'immagine.");

  const { data: p } = await supabase
    .from("participations")
    .select(
      "id, user_id, tournament_id, played_on, standalone_label, placement, players_count, wins, losses, closed_at, tournaments(title, starts_at, shops(name, logo_url))",
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<
      {
        id: string;
        user_id: string;
        tournament_id: string | null;
        played_on: string;
        standalone_label: string | null;
        placement: number | null;
        players_count: number | null;
        wins: number;
        losses: number;
        closed_at: string | null;
        tournaments: { title: string; starts_at: string; shops: ShopRow | null } | null;
      },
      { merge: false }
    >();
  if (!p || !p.closed_at) return fail(404, "Risultato non trovato.");

  // Lo crea il giocatore, oppure un gestore del negozio che organizza il torneo (la RLS gli fa vedere il risultato e la
  // funzione restituisce il nome solo a lui). Chiunque altro: come se non esistesse.
  const isOwner = p.user_id === auth.user.id;
  let playerName: string | null = null;
  if (!isOwner) {
    if (!p.tournament_id) return fail(404, "Risultato non trovato.");
    const { data: players } = await supabase.rpc("shop_tournament_players", { p_tournament: p.tournament_id });
    const row = (players as { participation_id: string; player_name: string }[] | null)?.find((r) => r.participation_id === id);
    if (!row) return fail(404, "Risultato non trovato.");
    playerName = row.player_name;
  }

  const [{ data: details }, { data: matches }, { data: profile }] = await Promise.all([
    op.from("participation_details").select("leader_code, deck_id").eq("participation_id", id).maybeSingle(),
    op
      .from("matches")
      .select("round, opponent_leader_code, opponent_name, won_dice, result")
      .eq("participation_id", id)
      .order("round", { ascending: true })
      .overrideTypes<RawMatch[], { merge: false }>(),
    isOwner
      ? supabase.from("profiles").select("alias, display_name").eq("id", auth.user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!details?.leader_code) return fail(404, "Questo risultato non ha un leader: non posso creare l'immagine.");

  const leaders = await leadersFor(op, [details.leader_code, ...(matches ?? []).map((m) => m.opponent_leader_code)]);
  const leader = leaders.get(details.leader_code);
  if (!leader) return fail(404, "Leader non trovato.");

  let cards: ImageCard[] = [];
  if (details.deck_id) {
    const { data: rows } = await op.from("deck_cards").select("card_code, qty").eq("deck_id", details.deck_id);
    cards = await cardsFor(op, (rows ?? []).map((r) => ({ code: r.card_code, qty: r.qty })));
  }

  // Torneo libero: il locale scelto a mano (query a parte, così non dipende dall'esistenza della colonna).
  let shop = shopOf(p.tournaments?.shops);
  if (!shop) {
    const { data: s } = await supabase
      .from("participations")
      .select("shop:shops(name, logo_url)")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<{ shop: ShopRow | null }, { merge: false }>();
    shop = shopOf(s?.shop);
  }

  const who = profile as { alias: string | null; display_name: string | null } | null;
  return {
    ok: true,
    file: `risultato-${p.played_on}`,
    body: {
      kind: "result",
      title: playerName ?? (who?.alias || who?.display_name || "Giocatore"),
      leader: { code: leader.card_code, name: leader.name, colors: leader.colors, image_path: leader.image_path },
      cards,
      ...resultLabels(p.losses, p.placement, p.players_count),
      tournament: p.tournaments?.title ?? p.standalone_label,
      date: fmtDate(p.tournaments?.starts_at ?? p.played_on),
      shop,
      matchups: toMatchups(matches ?? [], leaders),
    },
  };
}

// Risultato inserito dal negozio (tabella tournament_results). La RLS limita chi lo può leggere.
export async function buildTournamentResultImage(supabase: Supabase, id: string): Promise<Built> {
  const op = supabase.schema("onepiece");
  const { data: r } = await op
    .from("tournament_results")
    .select("id, player_name, leader_code, decklist, placement, wins, losses, matchups, tournament_id")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<
      {
        id: string;
        player_name: string;
        leader_code: string;
        decklist: { code: string; qty: number }[];
        placement: number | null;
        wins: number;
        losses: number;
        matchups: RawMatch[];
        tournament_id: string;
      },
      { merge: false }
    >();
  if (!r) return fail(404, "Risultato non trovato.");

  const { data: t } = await supabase
    .from("tournaments")
    .select("title, starts_at, max_players, shops(name, logo_url)")
    .eq("id", r.tournament_id)
    .maybeSingle()
    .overrideTypes<{ title: string; starts_at: string; max_players: number | null; shops: ShopRow | null }, { merge: false }>();

  const matchups = Array.isArray(r.matchups) ? r.matchups : [];
  const leaders = await leadersFor(op, [r.leader_code, ...matchups.map((m) => m.opponent_leader_code ?? m.opponent_code)]);
  const leader = leaders.get(r.leader_code);
  if (!leader) return fail(404, "Leader non trovato.");

  const cards = await cardsFor(op, Array.isArray(r.decklist) ? r.decklist : []);
  return {
    ok: true,
    file: `risultato-${r.player_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
    body: {
      kind: "result",
      title: r.player_name,
      leader: { code: leader.card_code, name: leader.name, colors: leader.colors, image_path: leader.image_path },
      cards,
      ...resultLabels(r.losses, r.placement, t?.max_players ?? null),
      tournament: t?.title ?? null,
      date: t ? fmtDate(t.starts_at) : null,
      shop: shopOf(t?.shops),
      matchups: toMatchups(matchups, leaders),
    },
  };
}
