"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseDecklist } from "@/lib/onepiece/decklist";
import { resolveBandaiTournament } from "@/lib/tournament-link";
import { cleanNote } from "@/lib/note-text";

export type ActionState = { error?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACK_PATH = "/onepiece/risultati/track";

function text(fd: FormData, key: string, max: number) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Intero in [min, max], null se vuoto, NaN se non valido.
function int(fd: FormData, key: string, min: number, max: number): number | null {
  const v = text(fd, key, 10);
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : Number.NaN;
}

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

// Il track aperto si legge sempre dal database, mai dal client.
async function openTrackId(supabase: Supabase, uid: string): Promise<string | null> {
  const { data } = await supabase
    .from("participations")
    .select("id")
    .eq("user_id", uid)
    .is("closed_at", null)
    .maybeSingle();
  return data?.id ?? null;
}

export async function startTrack(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  if (!user) return { error: "Sessione scaduta: accedi di nuovo." };

  const tournamentId = text(fd, "tournament_id", 40);
  const label = text(fd, "standalone_label", 80);
  let leaderCode = text(fd, "leader_code", 20);
  const deckChoice = text(fd, "deck_choice", 40);
  const deckText = text(fd, "decklist", 4000);

  if (tournamentId && !UUID.test(tournamentId)) return { error: "Torneo non valido." };
  if (!tournamentId && !label) return { error: "Scegli un torneo o scrivi il nome del torneo libero." };

  const op = supabase.schema("onepiece");

  let existingDeckId: string | null = null;
  let newDeck: ReturnType<typeof parseDecklist> | null = null;
  if (deckChoice === "new") {
    // La lista può includere il leader: se c'è, è quello del mazzo.
    const { data: ls } = await op.from("leaders").select("card_code");
    newDeck = parseDecklist(deckText, { leaderCodes: new Set((ls ?? []).map((l) => l.card_code)) });
    if (newDeck.errors.length > 0) return { error: newDeck.errors[0] };
    if (newDeck.cards.length === 0) return { error: "Incolla una decklist valida o scegli un mazzo salvato." };
    if (newDeck.leaderCode) {
      if (leaderCode && leaderCode !== newDeck.leaderCode) {
        return { error: `La decklist ha il leader ${newDeck.leaderCode}, diverso da ${leaderCode}.` };
      }
      leaderCode = newDeck.leaderCode;
    }
  } else if (deckChoice) {
    if (!UUID.test(deckChoice)) return { error: "Mazzo non valido." };
    const { data: d } = await op
      .from("decks")
      .select("id, leader_code")
      .eq("id", deckChoice)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!d?.leader_code) return { error: "Mazzo non trovato." };
    existingDeckId = d.id;
    leaderCode = d.leader_code; // il mazzo salvato decide il leader, come in "Cambia mazzo"
  }
  if (!leaderCode) return { error: "Scegli il tuo leader o incolla una decklist che lo include." };

  if (tournamentId) {
    const { data: t } = await supabase.from("tournaments").select("id").eq("id", tournamentId).maybeSingle();
    if (!t) return { error: "Torneo non trovato." };
  }
  // Locale facoltativo per i tornei liberi (nome e logo nelle immagini): deve essere un locale visibile.
  const shopChoice = tournamentId ? "" : text(fd, "shop_id", 40);
  if (shopChoice) {
    if (!UUID.test(shopChoice)) return { error: "Locale non valido." };
    const { data: shop } = await supabase.from("shops").select("id").eq("id", shopChoice).maybeSingle();
    if (!shop) return { error: "Locale non trovato." };
  }
  if (await openTrackId(supabase, user.id)) return { error: "Hai già un track in corso." };

  const { data: tcg } = await supabase.from("tcgs").select("id").eq("slug", "onepiece").single();
  if (!tcg) return { error: "Gioco non configurato." };

  // Link a un evento Bandai: si ritrova il torneo già collegato (di un negozio o di un altro giocatore)
  // oppure se ne crea uno comunitario con il nome indicato.
  let linkedTournamentId = tournamentId;
  const link = text(fd, "bandai_url", 2000);
  if (!tournamentId && link) {
    const resolved = await resolveBandaiTournament(supabase, user.id, {
      link,
      title: label,
      startsAt: new Date().toISOString(),
      tcgId: tcg.id,
    });
    if ("error" in resolved) return { error: resolved.error };
    linkedTournamentId = resolved.id;
  }

  let deckId = existingDeckId;
  let createdDeckId: string | null = null;
  if (newDeck) {
    const { data: d, error } = await op
      .from("decks")
      .insert({
        name: `Mazzo ${leaderCode} ${new Date().toISOString().slice(0, 10)}`,
        leader_code: leaderCode,
        decklist_text: deckText,
        visibility: "private",
      })
      .select("id")
      .single();
    if (error || !d) {
      return {
        error:
          error?.code === "23503"
            ? "Leader non valido."
            : "Non sono riuscito a salvare la decklist.",
      };
    }
    createdDeckId = d.id;
    deckId = d.id;
    const { error: cardsErr } = await op
      .from("deck_cards")
      .insert(newDeck.cards.map((c) => ({ deck_id: d.id, ...c })));
    if (cardsErr) {
      await op.from("decks").delete().eq("id", d.id);
      return { error: "Non sono riuscito a salvare le carte del mazzo." };
    }
  }

  const rollbackDeck = async () => {
    if (createdDeckId) await op.from("decks").delete().eq("id", createdDeckId);
  };

  const { data: part, error: partErr } = await supabase
    .from("participations")
    .insert({
      tournament_id: linkedTournamentId || null,
      tcg_id: tcg.id,
      played_on: new Date().toISOString().slice(0, 10),
      standalone_label: linkedTournamentId ? null : label,
      ...(shopChoice ? { shop_id: shopChoice } : {}),
      closed_at: null,
    })
    .select("id")
    .single();
  if (partErr || !part) {
    await rollbackDeck();
    return {
      error:
        partErr?.code === "23505"
          ? "Hai già un track in corso o un risultato per questo torneo."
          : "Non sono riuscito ad avviare il track.",
    };
  }

  const { error: detErr } = await op
    .from("participation_details")
    .insert({ participation_id: part.id, leader_code: leaderCode, deck_id: deckId });
  if (detErr) {
    await supabase.from("participations").delete().eq("id", part.id);
    await rollbackDeck();
    return { error: detErr.code === "23503" ? "Leader non valido." : "Non sono riuscito ad avviare il track." };
  }

  redirect(TRACK_PATH);
}

export async function addRound(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  if (!user) return { error: "Sessione scaduta: accedi di nuovo." };

  const pid = await openTrackId(supabase, user.id);
  if (!pid) return { error: "Nessun track in corso." };

  const opponent = text(fd, "opponent_leader", 20);
  const dice = text(fd, "dice", 4);
  const turn = text(fd, "turn", 6);
  const result = text(fd, "result", 4);
  if (result !== "win" && result !== "loss" && result !== "bye") return { error: "Indica l'esito del round." };
  // Il BYE è un turno di riposo: conta come vinto e non ha avversario né dado. Il pareggio non esiste.
  const isBye = result === "bye";
  if (!isBye && !opponent) return { error: "Scegli il leader avversario." };
  if (!isBye && dice !== "won" && dice !== "lost") return { error: "Indica se hai vinto il dado." };
  if (!isBye && turn !== "first" && turn !== "second") return { error: "Indica se hai giocato per primo o per secondo." };
  // Si legge più lungo del massimo per accorgersi dei testi troppo lunghi invece di tagliarli in silenzio.
  const note = cleanNote(text(fd, "notes", 1000));
  if ("error" in note) return { error: note.error };

  const op = supabase.schema("onepiece");
  const { data: last } = await op
    .from("matches")
    .select("round")
    .eq("participation_id", pid)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();
  const round = (last?.round ?? 0) + 1;
  if (round > 30) return { error: "Hai raggiunto il massimo di 30 round." };

  const { error } = await op.from("matches").insert({
    participation_id: pid,
    round,
    opponent_leader_code: isBye ? null : opponent,
    won_dice: isBye ? null : dice === "won",
    went_first: isBye ? null : turn === "first",
    result,
    notes: note.value,
  });
  if (error) {
    if (error.code === "23505") return { error: "Round già registrato: aggiorna la pagina." };
    if (error.code === "23503") return { error: "Leader avversario non valido." };
    return { error: "Non sono riuscito a salvare il round." };
  }

  revalidatePath(TRACK_PATH);
  return {};
}

export async function undoLastRound(): Promise<void> {
  const { supabase, user } = await session();
  if (!user) return;
  const pid = await openTrackId(supabase, user.id);
  if (!pid) return;

  const op = supabase.schema("onepiece");
  const { data: last } = await op
    .from("matches")
    .select("round")
    .eq("participation_id", pid)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.round != null) {
    await op.from("matches").delete().eq("participation_id", pid).eq("round", last.round);
  }
  revalidatePath(TRACK_PATH);
}

export async function closeTrack(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  if (!user) return { error: "Sessione scaduta: accedi di nuovo." };

  const pid = await openTrackId(supabase, user.id);
  if (!pid) return { error: "Nessun track in corso." };

  const placement = int(fd, "placement", 1, 9999);
  const playersCount = int(fd, "players_count", 1, 9999);
  if (Number.isNaN(placement) || Number.isNaN(playersCount)) {
    return { error: "Controlla piazzamento e numero di giocatori." };
  }
  if (placement !== null && playersCount !== null && placement > playersCount) {
    return { error: "Il piazzamento non può superare il numero di giocatori." };
  }

  // Il record si calcola dai round: unica fonte di verità.
  const { data: matches, error: mErr } = await supabase
    .schema("onepiece")
    .from("matches")
    .select("result")
    .eq("participation_id", pid);
  if (mErr) return { error: "Non sono riuscito a leggere i round." };

  const count = (r: string) => (matches ?? []).filter((m) => m.result === r).length;

  const { error } = await supabase
    .from("participations")
    .update({
      wins: count("win") + count("bye"), // il BYE conta come vinto
      losses: count("loss"),
      placement,
      players_count: playersCount,
      closed_at: new Date().toISOString(),
    })
    .eq("id", pid)
    .is("closed_at", null);
  if (error) return { error: "Non sono riuscito a chiudere il torneo." };

  redirect("/onepiece/risultati");
}

export async function cancelTrack(): Promise<void> {
  const { supabase, user } = await session();
  if (!user) return;
  // Elimina solo il track aperto dell'utente: round e dettagli vanno in cascata.
  await supabase.from("participations").delete().eq("user_id", user.id).is("closed_at", null);
  redirect("/onepiece/risultati");
}
