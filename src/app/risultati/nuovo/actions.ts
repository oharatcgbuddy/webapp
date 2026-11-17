"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDecklist } from "@/lib/onepiece/decklist";
import { romeLocalToIso } from "@/lib/datetime";
import { resolveBandaiTournament } from "@/lib/tournament-link";

export type ActionState = { error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(fd: FormData, key: string, max: number) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Restituisce un intero in [min, max], null se vuoto, NaN se non valido.
function int(fd: FormData, key: string, min: number, max: number): number | null {
  const v = text(fd, key, 10);
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : Number.NaN;
}

type MatchInput = {
  result: "win" | "loss" | "draw";
  on_play: boolean | null;
  opponent_name: string | null;
};

function parseMatches(raw: string): MatchInput[] | null {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length > 20) return null;
    const out: MatchInput[] = [];
    for (const item of arr) {
      if (typeof item !== "object" || item === null) return null;
      const m = item as Record<string, unknown>;
      if (m.result !== "win" && m.result !== "loss" && m.result !== "draw") return null;
      out.push({
        result: m.result,
        on_play: m.on_play === "yes" ? true : m.on_play === "no" ? false : null,
        opponent_name:
          typeof m.opponent_name === "string" && m.opponent_name.trim()
            ? m.opponent_name.trim().slice(0, 60)
            : null,
      });
    }
    return out;
  } catch {
    return null;
  }
}

export async function saveResult(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sessione scaduta: accedi di nuovo." };

  // --- Validazione (nessuna scrittura finché tutto non è valido) ---
  const tournamentId = text(fd, "tournament_id", 40);
  const label = text(fd, "standalone_label", 80);
  let playedOn = text(fd, "played_on", 10);
  const leaderCode = text(fd, "leader_code", 20) || null;
  const wins = int(fd, "wins", 0, 99);
  const losses = int(fd, "losses", 0, 99);
  const draws = int(fd, "draws", 0, 99);
  const placement = int(fd, "placement", 1, 9999);
  const playersCount = int(fd, "players_count", 1, 9999);
  const notes = text(fd, "notes", 1000) || null;
  const matches = parseMatches(text(fd, "matches", 4000));

  if ([wins, losses, draws, placement, playersCount].some((n) => Number.isNaN(n))) {
    return { error: "Controlla i numeri inseriti (vittorie, sconfitte, pareggi, piazzamento)." };
  }
  if (tournamentId && !UUID.test(tournamentId)) return { error: "Torneo non valido." };
  if (!tournamentId && !label) return { error: "Scegli un torneo o scrivi il nome del torneo libero." };
  if (matches === null) return { error: "Match non validi." };
  if (placement !== null && playersCount !== null && placement > playersCount) {
    return { error: "Il piazzamento non può superare il numero di giocatori." };
  }

  const deckText = text(fd, "decklist", 4000);
  const deck = deckText ? parseDecklist(deckText) : null;
  if (deck && deck.errors.length > 0) return { error: deck.errors[0] };
  if (deck && deck.cards.length === 0) return { error: "La decklist non contiene carte riconoscibili." };

  // Torneo censito: la data è quella del torneo.
  if (tournamentId) {
    const { data: t } = await supabase
      .from("tournaments")
      .select("starts_at")
      .eq("id", tournamentId)
      .maybeSingle();
    if (!t) return { error: "Torneo non trovato." };
    playedOn = new Date(t.starts_at).toISOString().slice(0, 10);
  }
  if (!DATE.test(playedOn)) return { error: "Inserisci la data del torneo." };
  if (playedOn > new Date().toISOString().slice(0, 10)) {
    return { error: "La data non può essere nel futuro." };
  }

  const { data: tcg } = await supabase.from("tcgs").select("id").eq("slug", "onepiece").single();
  if (!tcg) return { error: "Gioco non configurato." };

  // Link a un evento Bandai: si ritrova il torneo già collegato (di un negozio o di un altro giocatore)
  // oppure se ne crea uno comunitario con il nome e la data indicati.
  let linkedTournamentId = tournamentId;
  const link = text(fd, "bandai_url", 2000);
  if (!tournamentId && link) {
    const resolved = await resolveBandaiTournament(supabase, auth.user.id, {
      link,
      title: label,
      startsAt: romeLocalToIso(`${playedOn}T12:00`) ?? new Date(`${playedOn}T12:00:00Z`).toISOString(),
      tcgId: tcg.id,
    });
    if ("error" in resolved) return { error: resolved.error };
    linkedTournamentId = resolved.id;
    // Se il torneo esisteva già, la data è la sua.
    const { data: t } = await supabase.from("tournaments").select("starts_at").eq("id", resolved.id).maybeSingle();
    if (t) playedOn = new Date(t.starts_at).toISOString().slice(0, 10);
    if (playedOn > new Date().toISOString().slice(0, 10)) {
      return { error: "Questo evento è in una data futura: potrai aggiungere il risultato dopo." };
    }
  }

  const op = supabase.schema("onepiece");

  // --- Scritture (non transazionali: in caso di errore si annulla a mano) ---
  let deckId: string | null = null;
  if (deck) {
    const { data: d, error } = await op
      .from("decks")
      .insert({
        name: `Mazzo ${playedOn}`,
        leader_code: leaderCode,
        decklist_text: deckText,
        visibility: "private",
      })
      .select("id")
      .single();
    if (error || !d) return { error: "Non sono riuscito a salvare la decklist." };
    deckId = d.id;
    const { error: cardsErr } = await op
      .from("deck_cards")
      .insert(deck.cards.map((c) => ({ deck_id: deckId, ...c })));
    if (cardsErr) {
      await op.from("decks").delete().eq("id", deckId);
      return { error: "Non sono riuscito a salvare le carte del mazzo." };
    }
  }

  const { data: part, error: partErr } = await supabase
    .from("participations")
    .insert({
      tournament_id: linkedTournamentId || null,
      tcg_id: tcg.id,
      played_on: playedOn,
      standalone_label: linkedTournamentId ? null : label,
      placement,
      players_count: playersCount,
      wins: wins ?? 0,
      losses: losses ?? 0,
      draws: draws ?? 0,
      notes,
    })
    .select("id")
    .single();

  if (partErr || !part) {
    if (deckId) await op.from("decks").delete().eq("id", deckId);
    return {
      error:
        partErr?.code === "23505"
          ? "Hai già registrato un risultato per questo torneo."
          : "Non sono riuscito a salvare il risultato.",
    };
  }

  const { error: detErr } = await op
    .from("participation_details")
    .insert({ participation_id: part.id, leader_code: leaderCode, deck_id: deckId });

  let matchErr = null;
  if (!detErr && matches && matches.length > 0) {
    const res = await op.from("matches").insert(
      matches.map((m, i) => ({ participation_id: part.id, round: i + 1, ...m })),
    );
    matchErr = res.error;
  }

  if (detErr || matchErr) {
    await supabase.from("participations").delete().eq("id", part.id); // cascata su details e matches
    if (deckId) await op.from("decks").delete().eq("id", deckId);
    return { error: "Non sono riuscito a salvare tutti i dati. Nulla è stato registrato." };
  }

  redirect("/risultati");
}
