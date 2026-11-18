"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cleanNote } from "@/lib/note-text";

export type AliasState = { error?: string; saved?: boolean };

const ALIAS_MIN = 2;
const ALIAS_MAX = 24;

// Salva l'Alias del giocatore (nome mostrato nelle immagini che crea lui). Campo vuoto = nessun alias.
export async function saveAlias(_prev: AliasState, formData: FormData): Promise<AliasState> {
  const raw = formData.get("alias");
  const clean = cleanNote(typeof raw === "string" ? raw : "", ALIAS_MAX);
  if ("error" in clean) {
    return { error: clean.error.replace("La nota", "L'alias").replace("Nella nota", "Nell'alias").replace("nella nota", "nell'alias") };
  }
  if (clean.value !== null && [...clean.value].length < ALIAS_MIN) {
    return { error: `L'alias deve avere almeno ${ALIAS_MIN} caratteri.` };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Accedi per salvare l'alias." };

  const { error } = await supabase.from("profiles").update({ alias: clean.value }).eq("id", data.user.id);
  if (error) return { error: "Non sono riuscito a salvare l'alias. Riprova." };

  revalidatePath("/profilo");
  return { saved: true };
}
