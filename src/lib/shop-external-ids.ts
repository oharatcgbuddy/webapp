// ID del negozio su servizi esterni (per ora BANDAI TCG+), tabella `shop_external_ids`.
// Il gestore che scrive qui l'ID del proprio negozio acconsente a esporre i suoi eventi di TCG+ in TCG Buddy:
// i tornei li scarica poi lo script scripts/sync-bandai-events.mjs. Da qui non parte nessuna richiesta a Bandai.

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const BANDAI_ORGANIZER_SOURCE = "bandai_tcg_plus" as const;
export const BANDAI_ORGANIZER_ERROR = "L'ID organizzatore di BANDAI TCG+ deve essere un numero (fino a 12 cifre).";

// undefined = il campo non c'è nel modulo (non si tocca niente); null = campo vuoto (si toglie il collegamento).
export function parseBandaiOrganizerId(fd: FormData): { value: string | null | undefined } | { error: string } {
  const raw = fd.get("bandai_organizer_id");
  if (typeof raw !== "string") return { value: undefined };
  const v = raw.trim();
  if (!v) return { value: null };
  if (!/^\d{1,12}$/.test(v)) return { error: BANDAI_ORGANIZER_ERROR };
  return { value: v };
}

// Restituisce il messaggio d'errore, oppure null se è andato tutto bene.
export async function saveBandaiOrganizer(supabase: Supabase, shopId: string, value: string | null): Promise<string | null> {
  if (value === null) {
    const { error } = await supabase.from("shop_external_ids").delete().eq("shop_id", shopId).eq("source", BANDAI_ORGANIZER_SOURCE);
    return error ? "Non sono riuscito a togliere l'ID di BANDAI TCG+." : null;
  }
  // Niente upsert: PostgREST aggiornerebbe anche shop_id e source, ma ai gestori è concesso l'UPDATE solo su external_id.
  const { data: existing, error: readError } = await supabase
    .from("shop_external_ids")
    .select("shop_id")
    .eq("shop_id", shopId)
    .eq("source", BANDAI_ORGANIZER_SOURCE)
    .maybeSingle();
  if (readError) return "Non sono riuscito a salvare l'ID di BANDAI TCG+.";
  const { error } = existing
    ? await supabase
        .from("shop_external_ids")
        .update({ external_id: value })
        .eq("shop_id", shopId)
        .eq("source", BANDAI_ORGANIZER_SOURCE)
    : await supabase.from("shop_external_ids").insert({ shop_id: shopId, source: BANDAI_ORGANIZER_SOURCE, external_id: value });
  if (error?.code === "23505") return "Questo ID di BANDAI TCG+ è già collegato a un altro negozio.";
  return error ? "Non sono riuscito a salvare l'ID di BANDAI TCG+." : null;
}

export async function loadBandaiOrganizerId(supabase: Supabase, shopId: string): Promise<string> {
  const { data } = await supabase
    .from("shop_external_ids")
    .select("external_id")
    .eq("shop_id", shopId)
    .eq("source", BANDAI_ORGANIZER_SOURCE)
    .maybeSingle();
  return (data?.external_id as string | undefined) ?? "";
}
