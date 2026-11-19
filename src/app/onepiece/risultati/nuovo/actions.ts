"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDecklist } from "@/lib/onepiece/decklist";
import { romeLocalToIso } from "@/lib/datetime";
import { resolveBandaiTournament } from "@/lib/tournament-link";
import { cleanNote } from "@/lib/note-text";

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

const MAX_ROUNDS = 30; // come nel track in diretta

type MatchInput = {
  result: "win" | "loss" | "bye";
  opponent_leader_code: string | null;
  won_dice: boolean | null;
  went_first: boolean | null;
  notes: string | null;
};

// Stesse regole di addRound nel track: il BYE non ha avversario né dado, gli altri round sì.
// null = formato non valido; { error } = round incompleto o nota non ammessa (con il motivo da mostrare).
function parseMatches(raw: string): MatchInput[] | { error: string } | null {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length > MAX_ROUNDS) return null;
    const out: MatchInput[] = [];
    for (const item of arr) {
      if (typeof item !== "object" || item === null) return null;
      const m = item as Record<string, unknown>;
      const n = out.length + 1;
      if (m.result === "") return { error: `Round ${n}: indica l'esito.` }; // round aggiunto ma non compilato
      if (m.result !== "win" && m.result !== "loss" && m.result !== "bye") return null;
      const note = cleanNote(typeof m.notes === "string" ? m.notes.slice(0, 1000) : "");
      if ("error" in note) return { error: `Round ${n}: ${note.error}` };
      if (m.result === "bye") {
        out.push({ result: "bye", opponent_leader_code: null, won_dice: null, went_first: null, notes: note.value });
        continue;
      }
      const opponent = typeof m.opponent_leader_code === "string" ? m.opponent_leader_code.trim().slice(0, 20) : "";
      if (!opponent) return { error: `Round ${n}: scegli il leader avversario.` };
      if (m.dice !== "won" && m.dice !== "lost") return { error: `Round ${n}: indica se hai vinto il dado.` };
      if (m.turn !== "first" && m.turn !== "second") return { error: `Round ${n}: indica se hai giocato per primo o per secondo.` };
      out.push({
        result: m.result,
        opponent_leader_code: opponent,
        won_dice: m.dice === "won",
        went_first: m.turn === "first",
        notes: note.value,
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
  let leaderCode = text(fd, "leader_code", 20);
  const placement = int(fd, "placement", 1, 9999);
  const playersCount = int(fd, "players_count", 1, 9999);
  const notes = text(fd, "notes", 1000) || null;
  const matches = parseMatches(text(fd, "matches", 12000));
  const deckChoice = text(fd, "deck_choice", 40);

  if ([placement, playersCount].some((n) => Number.isNaN(n))) {
    return { error: "Controlla piazzamento e numero di giocatori." };
  }
  if (tournamentId && !UUID.test(tournamentId)) return { error: "Torneo non valido." };
  if (!tournamentId && !label) return { error: "Scegli un torneo o scrivi il nome del torneo libero." };
  if (matches === null) return { error: "Match non validi." };
  if ("error" in matches) return { error: matches.error };
  if (placement !== null && playersCount !== null && placement > playersCount) {
    return { error: "Il piazzamento non può superare il numero di giocatori." };
  }

  // Come nella chiusura del track: il record si calcola sempre dai round (il BYE conta come vinto).
  const count = (r: MatchInput["result"]) => matches.filter((m) => m.result === r).length;
  const wins = count("win") + count("bye");
  const losses = count("loss");

  const op = supabase.schema("onepiece");

  // Mazzo: uno già salvato oppure una nuova decklist incollata, come all'avvio del track.
  const deckText = text(fd, "decklist", 4000);
  let existingDeckId: string | null = null;
  let deck: ReturnType<typeof parseDecklist> | null = null;
  if (deckChoice === "new") {
    // La lista può includere il leader: se c'è, è quello del mazzo.
    const { data: ls } = await op.from("leaders").select("card_code");
    deck = parseDecklist(deckText, { leaderCodes: new Set((ls ?? []).map((l) => l.card_code)) });
    if (deck.errors.length > 0) return { error: deck.errors[0] };
    if (deck.cards.length === 0) return { error: "Incolla una decklist valida o scegli un mazzo salvato." };
    if (deck.leaderCode) {
      if (leaderCode && leaderCode !== deck.leaderCode) {
        return { error: `La decklist ha il leader ${deck.leaderCode}, diverso da ${leaderCode}.` };
      }
      leaderCode = deck.leaderCode;
    }
  } else if (deckChoice) {
    if (!UUID.test(deckChoice)) return { error: "Mazzo non valido." };
    const { data: d } = await op
      .from("decks")
      .select("id, leader_code")
      .eq("id", deckChoice)
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (!d?.leader_code) return { error: "Mazzo non trovato." };
    existingDeckId = d.id;
    leaderCode = d.leader_code; // il mazzo salvato decide il leader, come in "Cambia mazzo"
  }
  if (!leaderCode) return { error: "Scegli il tuo leader o incolla una decklist che lo include." };

  // Locale facoltativo per i tornei liberi (nome e logo nelle immagini): deve essere un locale visibile.
  const shopChoice = tournamentId ? "" : text(fd, "shop_id", 40);
  if (shopChoice) {
    if (!UUID.test(shopChoice)) return { error: "Locale non valido." };
    const { data: shop } = await supabase.from("shops").select("id").eq("id", shopChoice).maybeSingle();
    if (!shop) return { error: "Locale non trovato." };
  }

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

  // --- Scritture (non transazionali: in caso di errore si annulla a mano) ---
  let deckId: string | null = existingDeckId;
  let createdDeckId: string | null = null;
  if (deck) {
    const { data: d, error } = await op
      .from("decks")
      .insert({
        name: `Mazzo ${leaderCode} ${playedOn}`,
        leader_code: leaderCode,
        decklist_text: deckText,
        visibility: "private",
      })
      .select("id")
      .single();
    if (error || !d) {
      return { error: error?.code === "23503" ? "Leader non valido." : "Non sono riuscito a salvare la decklist." };
    }
    createdDeckId = d.id;
    deckId = d.id;
    const { error: cardsErr } = await op
      .from("deck_cards")
      .insert(deck.cards.map((c) => ({ deck_id: d.id, ...c })));
    if (cardsErr) {
      await op.from("decks").delete().eq("id", d.id);
      return { error: "Non sono riuscito a salvare le carte del mazzo." };
    }
  }
  // Si elimina solo il mazzo creato qui, mai uno già salvato dall'utente.
  const rollbackDeck = async () => {
    if (createdDeckId) await op.from("decks").delete().eq("id", createdDeckId);
  };

  const { data: part, error: partErr } = await supabase
    .from("participations")
    .insert({
      tournament_id: linkedTournamentId || null,
      tcg_id: tcg.id,
      played_on: playedOn,
      standalone_label: linkedTournamentId ? null : label,
      ...(shopChoice && !linkedTournamentId ? { shop_id: shopChoice } : {}),
      placement,
      players_count: playersCount,
      wins,
      losses,
      notes,
    })
    .select("id")
    .single();

  if (partErr || !part) {
    await rollbackDeck();
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
    await rollbackDeck();
    const fk = detErr?.code === "23503" || matchErr?.code === "23503";
    return {
      error: fk
        ? "Leader non valido: controlla il tuo leader e quelli degli avversari. Nulla è stato registrato."
        : "Non sono riuscito a salvare tutti i dati. Nulla è stato registrato.",
    };
  }

  redirect("/onepiece/risultati");
}
