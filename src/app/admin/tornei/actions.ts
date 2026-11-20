"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { romeLocalToIso } from "@/lib/datetime";
import { isAdmin } from "@/lib/shop-access";

export type ActionState = { error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["scheduled", "completed", "cancelled"] as const;

function text(fd: FormData, key: string, max: number) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseEuro(raw: string): number | null | "invalid" {
  if (!raw) return null;
  const v = raw.replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(v)) return "invalid";
  return Math.round(Number(v) * 100);
}

// Solo l'admin: le regole del database sono l'ultima difesa, qui si evitano scritture "silenziose" da 0 righe.
async function adminCtx() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !(await isAdmin(supabase, auth.user.id))) return null;
  return { supabase, uid: auth.user.id };
}

const NO_ACCESS = { error: "Non sei autorizzato." };

function parseRegional(fd: FormData) {
  const title = text(fd, "title", 80);
  const venue = text(fd, "venue", 120);
  const tcgId = Number(text(fd, "tcg_id", 5));
  const startsAt = romeLocalToIso(text(fd, "starts_at", 16));
  const fee = parseEuro(text(fd, "entry_fee", 10));
  const maxRaw = text(fd, "max_players", 5);
  const max = maxRaw === "" ? null : Number(maxRaw);
  const status = text(fd, "status", 12) || "scheduled";

  if (!title) return { error: "Inserisci il titolo del torneo." } as const;
  if (!venue) return { error: "Inserisci il luogo (es. Fiera di Rimini, Rimini)." } as const;
  if (!Number.isInteger(tcgId) || tcgId < 1) return { error: "Scegli il gioco." } as const;
  if (!startsAt) return { error: "Data e ora non valide." } as const;
  if (fee === "invalid") return { error: "Il costo non è valido (es. 5 oppure 5,50)." } as const;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 99999)) {
    return { error: "Il numero di posti non è valido." } as const;
  }
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "Stato non valido." } as const;

  return {
    values: {
      title,
      venue,
      tcg_id: tcgId,
      format_slug: text(fd, "format_slug", 30) || null,
      starts_at: startsAt,
      entry_fee_cents: fee,
      max_players: max,
      prizes: text(fd, "prizes", 500) || null,
      notes: text(fd, "notes", 1000) || null,
      status,
      kind: "regional",
      shop_id: null,
    },
  } as const;
}

function refresh() {
  revalidatePath("/admin/tornei");
  revalidatePath("/");
}

export async function createRegional(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NO_ACCESS;
  const parsed = parseRegional(fd);
  if ("error" in parsed) return { error: parsed.error };

  const { error } = await ctx.supabase.from("tournaments").insert({ ...parsed.values, created_by: ctx.uid });
  if (error) return { error: "Non sono riuscito a creare il torneo." };

  refresh();
  redirect("/admin/tornei");
}

export async function updateRegional(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NO_ACCESS;
  if (!UUID.test(id)) return { error: "Torneo non valido." };
  const parsed = parseRegional(fd);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await ctx.supabase
    .from("tournaments")
    .update(parsed.values)
    .eq("id", id)
    .eq("kind", "regional")
    .select("id");
  if (error || !data || data.length === 0) return { error: "Non sono riuscito a salvare il torneo." };

  refresh();
  redirect("/admin/tornei");
}

export async function deleteRegional(id: string): Promise<void> {
  const ctx = await adminCtx();
  if (!ctx || !UUID.test(id)) return;

  const { error } = await ctx.supabase.from("tournaments").delete().eq("id", id).eq("kind", "regional");
  if (error) redirect(`/admin/tornei/${id}?errore=elimina`);

  refresh();
  redirect("/admin/tornei");
}
