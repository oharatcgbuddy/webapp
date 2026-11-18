"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cambia il mazzo usato in un proprio torneo (anche chiuso). Il leader del torneo diventa quello del mazzo.
// Partecipazione e mazzo devono essere dell'utente: lo si controlla qui oltre che nelle regole del database.
export async function changeDeck(participationId: string, formData: FormData): Promise<void> {
  const deckId = formData.get("deck_id");
  if (!UUID.test(participationId) || typeof deckId !== "string" || !UUID.test(deckId)) return;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const op = supabase.schema("onepiece");
  const [{ data: part }, { data: deck }] = await Promise.all([
    supabase.from("participations").select("id").eq("id", participationId).eq("user_id", auth.user.id).maybeSingle(),
    op.from("decks").select("id, leader_code").eq("id", deckId).eq("owner_id", auth.user.id).maybeSingle(),
  ]);
  if (!part || !deck?.leader_code) return;

  await op
    .from("participation_details")
    .upsert({ participation_id: part.id, deck_id: deck.id, leader_code: deck.leader_code }, { onConflict: "participation_id" });

  revalidatePath(`/onepiece/risultati/${participationId}`);
  revalidatePath("/onepiece/risultati/track");
}

// Imposta il locale di un proprio torneo libero (vuoto = nessuno). Il locale deve essere visibile all'utente.
export async function changeShop(participationId: string, formData: FormData): Promise<void> {
  const raw = formData.get("shop_id");
  const shopId = typeof raw === "string" && raw !== "" ? raw : null;
  if (!UUID.test(participationId) || (shopId !== null && !UUID.test(shopId))) return;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  if (shopId) {
    const { data: shop } = await supabase.from("shops").select("id").eq("id", shopId).maybeSingle();
    if (!shop) return;
  }
  await supabase.from("participations").update({ shop_id: shopId }).eq("id", participationId).eq("user_id", auth.user.id);

  revalidatePath(`/onepiece/risultati/${participationId}`);
}

// Elimina un proprio risultato. Round e dettagli vanno in cascata; i mazzi restano.
export async function deleteResult(id: string): Promise<void> {
  if (!UUID.test(id)) return;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  await supabase.from("participations").delete().eq("id", id).eq("user_id", auth.user.id);
  redirect("/onepiece/risultati");
}
