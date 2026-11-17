import type { createClient } from "@/lib/supabase/server";
import { BANDAI_LINK_ERROR, BANDAI_SOURCE, parseBandaiEventLink } from "@/lib/bandai";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LinkedTournament = { id: string } | { error: string };

// Dato il link a un evento Bandai: restituisce il torneo già collegato a quell'ID oppure,
// se non esiste, ne crea uno "comunitario" (senza negozio, non verificato) con il nome indicato.
// Così due giocatori che incollano lo stesso link finiscono sullo stesso torneo.
export async function resolveBandaiTournament(
  supabase: Supabase,
  uid: string,
  input: { link: string; title: string; startsAt: string; tcgId: number },
): Promise<LinkedTournament> {
  const event = parseBandaiEventLink(input.link);
  if (!event) return { error: BANDAI_LINK_ERROR };

  const find = () =>
    supabase
      .from("tournaments")
      .select("id")
      .eq("external_source", BANDAI_SOURCE)
      .eq("external_id", event.id)
      .maybeSingle();

  const { data: existing, error: findErr } = await find();
  if (findErr) return { error: "Non sono riuscito a cercare l'evento. Riprova." };
  if (existing) return { id: existing.id };

  if (!input.title) {
    return { error: "Questo evento non è ancora nell'app: scrivi anche il nome del torneo." };
  }

  const { data: created, error } = await supabase
    .from("tournaments")
    .insert({
      shop_id: null,
      tcg_id: input.tcgId,
      title: input.title,
      starts_at: input.startsAt,
      // "concluso" per non finire nell'elenco dei prossimi tornei: è un evento segnalato da un giocatore.
      status: "completed",
      external_source: BANDAI_SOURCE,
      external_id: event.id,
      created_by: uid,
    })
    .select("id")
    .single();

  if (created) return { id: created.id };

  // Un altro giocatore può averlo creato nel frattempo (violazione di unicità): si riprova a cercarlo.
  if (error?.code === "23505") {
    const { data: again } = await find();
    if (again) return { id: again.id };
    return { error: "Questo evento è già associato a un altro torneo che non puoi vedere." };
  }
  if (error?.message.includes("troppi tornei")) return { error: "Hai creato troppi tornei da link oggi. Riprova domani." };
  return { error: "Non sono riuscito a collegare l'evento." };
}
