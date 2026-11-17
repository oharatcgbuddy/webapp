"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

const CODE = /^[A-Z0-9]+-\d{3}$/;

// Il controllo admin è nella funzione SQL (security definer): qui si valida e si inoltra la chiamata.
export async function saveMeta(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = fd.get("codes");
  if (typeof raw !== "string" || raw.length > 2000) return { error: "Elenco non valido." };

  let codes: unknown;
  try {
    codes = JSON.parse(raw);
  } catch {
    return { error: "Elenco non valido." };
  }
  if (!Array.isArray(codes) || codes.length > 40) return { error: "Elenco non valido (massimo 40 leader)." };
  if (!codes.every((c): c is string => typeof c === "string" && CODE.test(c))) {
    return { error: "Elenco non valido." };
  }
  if (new Set(codes).size !== codes.length) return { error: "Ci sono leader ripetuti." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_meta_leaders", { p_codes: codes });
  if (error) {
    if (error.code === "42501") return { error: "Non sei autorizzato." };
    return { error: "Non sono riuscito a salvare l'elenco." };
  }

  revalidatePath("/admin/meta");
  revalidatePath("/risultati/track");
  revalidatePath("/risultati/nuovo");
  return { ok: true };
}
