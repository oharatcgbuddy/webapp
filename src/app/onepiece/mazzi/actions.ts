"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cleanNote } from "@/lib/note-text";
import {
  MAX_COPIES,
  checkDeck,
  deckToText,
  entriesFromCards,
  type CatalogCard,
} from "@/lib/onepiece/deck-rules";

export type ActionState = { error?: string };
export type SaveResult = { ok?: boolean; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z0-9]+-\d{3}$/;
const LIST = "/onepiece/mazzi";
const NAME_MAX = 60;

function text(fd: FormData, key: string, max: number) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const nameError = (msg: string) => msg.replace("La nota", "Il nome").replace("Nella nota", "Nel nome").replace("nella nota", "nel nome");

// Il proprietario si controlla due volte: qui e nelle regole del database.
export async function createDeck(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sessione scaduta: accedi di nuovo." };

  const name = cleanNote(text(fd, "name", 300), NAME_MAX);
  if ("error" in name) return { error: nameError(name.error) };
  if (!name.value) return { error: "Dai un nome al mazzo." };

  const leader = text(fd, "leader_code", 20);
  if (!CODE.test(leader)) return { error: "Scegli il leader del mazzo." };

  const op = supabase.schema("onepiece");
  const { data: l } = await op.from("leaders").select("card_code").eq("card_code", leader).maybeSingle();
  if (!l) return { error: "Leader non valido." };

  const { data: deck, error } = await op
    .from("decks")
    .insert({ name: name.value, leader_code: leader, visibility: "private", decklist_text: "" })
    .select("id")
    .single();
  if (error || !deck) return { error: "Non sono riuscito a creare il mazzo." };

  revalidatePath(LIST);
  redirect(`${LIST}/${deck.id}`);
}

export async function saveDeck(
  deckId: string,
  rawName: string,
  rawCards: { card_code: string; qty: number }[],
): Promise<SaveResult> {
  if (!UUID.test(deckId)) return { error: "Mazzo non valido." };
  if (!Array.isArray(rawCards) || rawCards.length > 100) return { error: "Elenco di carte non valido." };
  for (const c of rawCards) {
    if (
      typeof c !== "object" || c === null || typeof c.card_code !== "string" || !CODE.test(c.card_code) ||
      !Number.isInteger(c.qty) || c.qty < 1 || c.qty > MAX_COPIES
    ) {
      return { error: "Elenco di carte non valido." };
    }
  }
  const codes = [...new Set(rawCards.map((c) => c.card_code))];
  if (codes.length !== rawCards.length) return { error: "Ci sono carte ripetute." };

  const name = cleanNote(typeof rawName === "string" ? rawName.slice(0, 300) : "", NAME_MAX);
  if ("error" in name) return { error: nameError(name.error) };
  if (!name.value) return { error: "Dai un nome al mazzo." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sessione scaduta: accedi di nuovo." };
  const op = supabase.schema("onepiece");

  const { data: deck } = await op.from("decks").select("id, leader_code").eq("id", deckId).eq("owner_id", auth.user.id).maybeSingle();
  if (!deck) return { error: "Mazzo non trovato." };
  const { data: leader } = await op.from("leaders").select("colors").eq("card_code", deck.leader_code).maybeSingle();
  if (!leader) return { error: "Leader del mazzo non trovato." };

  // Le carte si controllano sul catalogo: deck_cards non ha un legame con la tabella delle carte.
  const catalog = new Map<string, CatalogCard>();
  if (codes.length > 0) {
    const { data: found, error } = await op
      .from("cards")
      .select("card_code, name, type, colors, cost, power, counter, rarity, set_code, image_path, traits")
      .in("card_code", codes)
      .overrideTypes<CatalogCard[], { merge: false }>();
    if (error) return { error: "Non sono riuscito a controllare le carte." };
    for (const c of found ?? []) catalog.set(c.card_code, c);
  }

  const entries = entriesFromCards(rawCards);
  const check = checkDeck(entries, catalog, (leader.colors as string[]) ?? []);
  if (check.errors.length > 0) return { error: check.errors[0] };

  // Prima si scrivono le carte presenti, poi si tolgono quelle che non ci sono più: se qualcosa va storto
  // a metà, il mazzo resta con carte in più e non vuoto.
  if (rawCards.length > 0) {
    const { error } = await op
      .from("deck_cards")
      .upsert(rawCards.map((c) => ({ deck_id: deckId, card_code: c.card_code, qty: c.qty })), { onConflict: "deck_id,card_code" });
    if (error) return { error: "Non sono riuscito a salvare le carte." };
  }
  const del = op.from("deck_cards").delete().eq("deck_id", deckId);
  const { error: delError } = codes.length > 0 ? await del.not("card_code", "in", `(${codes.join(",")})`) : await del;
  if (delError) return { error: "Non sono riuscito ad aggiornare le carte del mazzo." };

  const { error: upError } = await op
    .from("decks")
    .update({ name: name.value, decklist_text: deckToText(entries) })
    .eq("id", deckId);
  if (upError) return { error: "Non sono riuscito a salvare il nome del mazzo." };

  revalidatePath(LIST);
  revalidatePath(`${LIST}/${deckId}`);
  return { ok: true };
}

export async function deleteDeck(fd: FormData): Promise<void> {
  const id = fd.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { error } = await supabase.schema("onepiece").from("decks").delete().eq("id", id).eq("owner_id", auth.user.id);
  if (error) redirect(`${LIST}/${id}?errore=elimina`);

  revalidatePath(LIST);
  redirect(LIST);
}
