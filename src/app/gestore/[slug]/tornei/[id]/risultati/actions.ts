"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageShop } from "@/lib/shop-access";
import { cleanNote } from "@/lib/note-text";
import { parseDecklist } from "@/lib/onepiece/decklist";

export type ResultState = { error?: string; ok?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;
const CODE = /^[A-Z0-9]+-\d{3}$/;
const RESULTS = ["win", "loss", "draw", "bye"] as const;
type Outcome = (typeof RESULTS)[number];

// Il gestore (membro o admin) deve possedere il negozio che organizza il torneo.
async function managed(slug: string, tournamentId: string) {
  if (!SLUG.test(slug) || !UUID.test(tournamentId)) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop || !(await canManageShop(supabase, shop.id, auth.user.id))) return null;
  const { data: t } = await supabase.from("tournaments").select("id").eq("id", tournamentId).eq("shop_id", shop.id).maybeSingle();
  if (!t) return null;
  return { supabase, op: supabase.schema("onepiece") };
}

function int(fd: FormData, key: string, min: number, max: number): number | null | "bad" {
  const v = fd.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : "bad";
}

const asName = (msg: string) => msg.replace("La nota", "Il nome").replace("Nella nota", "Nel nome").replace("nella nota", "nel nome");

export async function createResult(slug: string, tournamentId: string, _prev: ResultState, fd: FormData): Promise<ResultState> {
  const ctx = await managed(slug, tournamentId);
  if (!ctx) return { error: "Non hai i permessi per questo torneo." };

  const name = cleanNote(typeof fd.get("player_name") === "string" ? (fd.get("player_name") as string) : "", 40);
  if ("error" in name) return { error: asName(name.error) };
  if (name.value === null) return { error: "Scrivi il nome del giocatore." };

  const leaderCode = typeof fd.get("leader_code") === "string" ? (fd.get("leader_code") as string) : "";
  if (!CODE.test(leaderCode)) return { error: "Scegli il leader del giocatore." };

  const { data: leaderRows } = await ctx.op.from("leaders").select("card_code");
  const leaderSet = new Set((leaderRows ?? []).map((l) => l.card_code as string));
  if (!leaderSet.has(leaderCode)) return { error: "Leader non valido." };

  // Mazzo (facoltativo): formato "4xOP01-013", una carta per riga.
  const deckText = typeof fd.get("decklist") === "string" ? (fd.get("decklist") as string).slice(0, 4000) : "";
  const parsed = parseDecklist(deckText, { requireFull: false });
  if (parsed.errors.length > 0) return { error: parsed.errors[0] };
  if (parsed.cards.some((c) => c.qty > 4)) return { error: "Una carta non può avere più di 4 copie." };
  if (parsed.cards.length > 0) {
    const { data: known } = await ctx.op.from("cards").select("card_code").in("card_code", parsed.cards.map((c) => c.card_code));
    const have = new Set((known ?? []).map((c) => c.card_code as string));
    const unknown = parsed.cards.filter((c) => !have.has(c.card_code)).map((c) => c.card_code);
    if (unknown.length > 0) return { error: `Carte non trovate: ${unknown.slice(0, 5).join(", ")}` };
  }

  // Scontri (facoltativi): una riga ogni terna avversario / dado / esito.
  const leaders = fd.getAll("m_leader").map(String);
  const dice = fd.getAll("m_dice").map(String);
  const outcomes = fd.getAll("m_result").map(String);
  const matchups: { round: number; opponent_code: string | null; dice_won: boolean | null; result: Outcome }[] = [];
  for (let i = 0; i < outcomes.length && matchups.length < 16; i++) {
    const result = outcomes[i] as Outcome;
    if (!outcomes[i]) continue; // riga lasciata vuota
    if (!RESULTS.includes(result)) return { error: `Round ${i + 1}: esito non valido.` };
    const opp = result === "bye" ? "" : (leaders[i] ?? "");
    if (opp && !leaderSet.has(opp)) return { error: `Round ${i + 1}: leader avversario non valido.` };
    matchups.push({
      round: matchups.length + 1,
      opponent_code: opp || null,
      dice_won: result === "bye" ? null : dice[i] === "won" ? true : dice[i] === "lost" ? false : null,
      result,
    });
  }

  const placement = int(fd, "placement", 1, 1024);
  if (placement === "bad") return { error: "Il piazzamento deve essere un numero." };

  // Con gli scontri il record si calcola da lì (il BYE conta come vinto); altrimenti si usano i numeri scritti.
  let wins: number | null | "bad";
  let losses: number | null | "bad";
  let draws: number | null | "bad";
  if (matchups.length > 0) {
    wins = matchups.filter((m) => m.result === "win" || m.result === "bye").length;
    losses = matchups.filter((m) => m.result === "loss").length;
    draws = matchups.filter((m) => m.result === "draw").length;
  } else {
    wins = int(fd, "wins", 0, 30);
    losses = int(fd, "losses", 0, 30);
    draws = int(fd, "draws", 0, 30);
    if (wins === "bad" || losses === "bad" || draws === "bad") return { error: "Vittorie, sconfitte e pareggi devono essere numeri da 0 a 30." };
  }

  const { error } = await ctx.op.from("tournament_results").insert({
    tournament_id: tournamentId,
    player_name: name.value,
    leader_code: leaderCode,
    decklist: parsed.cards.map((c) => ({ code: c.card_code, qty: c.qty })),
    placement,
    wins: wins ?? 0,
    losses: losses ?? 0,
    draws: draws ?? 0,
    matchups,
  });
  if (error) return { error: "Non sono riuscito a salvare il risultato. Riprova." };

  revalidatePath(`/gestore/${slug}/tornei/${tournamentId}/risultati`);
  return { ok: true };
}

export async function deleteResult(slug: string, tournamentId: string, formData: FormData): Promise<void> {
  const ctx = await managed(slug, tournamentId);
  const id = formData.get("id");
  if (!ctx || typeof id !== "string" || !UUID.test(id)) return;
  await ctx.op.from("tournament_results").delete().eq("id", id).eq("tournament_id", tournamentId);
  revalidatePath(`/gestore/${slug}/tornei/${tournamentId}/risultati`);
}
