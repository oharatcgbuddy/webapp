"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { romeLocalToIso } from "@/lib/datetime";
import { BANDAI_LINK_ERROR, BANDAI_SOURCE, parseBandaiEventLink } from "@/lib/bandai";
import { parseShopFields } from "@/lib/shop-fields";
import { canManageShop } from "@/lib/shop-access";
import { shopLogoPathOk } from "@/lib/shop-logo";

export type ActionState = { error?: string; ok?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;
const STATUSES = ["scheduled", "completed", "cancelled"] as const;

function text(fd: FormData, key: string, max: number) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Verifica che l'utente gestisca il negozio (membro o admin). Le RLS restano l'ultima difesa,
// ma qui si evitano scritture "silenziose" da 0 righe.
async function managedShop(slug: string) {
  if (!SLUG.test(slug)) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) return null;
  if (!(await canManageShop(supabase, shop.id, auth.user.id))) return null;

  return { supabase, shopId: shop.id as string, uid: auth.user.id };
}

const NO_ACCESS = { error: "Non hai i permessi per questo negozio." };

// ---------- Negozio ----------

export async function updateShop(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await managedShop(slug);
  if (!ctx) return NO_ACCESS;

  const parsed = parseShopFields(fd);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await ctx.supabase
    .from("shops")
    .update(parsed.values)
    .eq("id", ctx.shopId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Non sono riuscito a salvare le modifiche." };

  revalidatePath(`/gestore/${slug}`);
  revalidatePath(`/negozi/${slug}`);
  return { ok: true };
}

// Salva il percorso del logo appena caricato nel bucket "shop-logos" e toglie quello vecchio.
export async function setShopLogo(slug: string, path: string): Promise<ActionState> {
  const ctx = await managedShop(slug);
  if (!ctx) return NO_ACCESS;
  if (!shopLogoPathOk(path, ctx.shopId)) return { error: "Logo non valido." };

  const { data: before } = await ctx.supabase.from("shops").select("logo_url").eq("id", ctx.shopId).maybeSingle();
  const { data, error } = await ctx.supabase.from("shops").update({ logo_url: path }).eq("id", ctx.shopId).select("id");
  if (error || !data || data.length === 0) return { error: "Non sono riuscito a salvare il logo." };

  const old = before?.logo_url as string | null | undefined;
  if (old && old !== path && shopLogoPathOk(old, ctx.shopId)) {
    await ctx.supabase.storage.from("shop-logos").remove([old]);
  }

  revalidatePath(`/gestore/${slug}`);
  return { ok: true };
}

// ---------- Tornei ----------

function parseEuro(raw: string): number | null | "invalid" {
  if (!raw) return null;
  const v = raw.replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(v)) return "invalid";
  return Math.round(Number(v) * 100);
}

function parseTournament(fd: FormData) {
  const title = text(fd, "title", 80);
  const tcgId = Number(text(fd, "tcg_id", 5));
  const startsAt = romeLocalToIso(text(fd, "starts_at", 16));
  const fee = parseEuro(text(fd, "entry_fee", 10));
  const maxRaw = text(fd, "max_players", 5);
  const max = maxRaw === "" ? null : Number(maxRaw);
  const status = text(fd, "status", 12) || "scheduled";
  const linkRaw = text(fd, "bandai_url", 2000);
  const link = linkRaw ? parseBandaiEventLink(linkRaw) : null;

  if (linkRaw && !link) return { error: BANDAI_LINK_ERROR } as const;
  if (!title) return { error: "Inserisci il titolo del torneo." } as const;
  if (!Number.isInteger(tcgId) || tcgId < 1) return { error: "Scegli il gioco." } as const;
  if (!startsAt) return { error: "Data e ora non valide." } as const;
  if (fee === "invalid") return { error: "Il costo non è valido (es. 5 oppure 5,50)." } as const;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 9999)) {
    return { error: "Il numero di posti non è valido." } as const;
  }
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "Stato non valido." } as const;

  return {
    values: {
      title,
      tcg_id: tcgId,
      format_slug: text(fd, "format_slug", 30) || null,
      starts_at: startsAt,
      entry_fee_cents: fee,
      max_players: max,
      prizes: text(fd, "prizes", 500) || null,
      notes: text(fd, "notes", 1000) || null,
      status,
      external_source: link ? BANDAI_SOURCE : null,
      external_id: link ? link.id : null,
    },
  } as const;
}

const LINK_TAKEN =
  "Questo evento Bandai è già collegato a un altro torneo (forse inserito da un giocatore). Per ora non puoi riusarlo.";

export async function createTournament(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await managedShop(slug);
  if (!ctx) return NO_ACCESS;

  const parsed = parseTournament(fd);
  if ("error" in parsed) return { error: parsed.error };

  const { error } = await ctx.supabase
    .from("tournaments")
    .insert({ ...parsed.values, shop_id: ctx.shopId, created_by: ctx.uid });
  if (error) return { error: error.code === "23505" ? LINK_TAKEN : "Non sono riuscito a creare il torneo." };

  revalidatePath(`/gestore/${slug}`);
  redirect(`/gestore/${slug}`);
}

export async function updateTournament(
  slug: string,
  id: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await managedShop(slug);
  if (!ctx) return NO_ACCESS;
  if (!UUID.test(id)) return { error: "Torneo non valido." };

  const parsed = parseTournament(fd);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await ctx.supabase
    .from("tournaments")
    .update(parsed.values)
    .eq("id", id)
    .eq("shop_id", ctx.shopId)
    .select("id");
  if (error?.code === "23505") return { error: LINK_TAKEN };
  if (error || !data || data.length === 0) return { error: "Non sono riuscito a salvare il torneo." };

  revalidatePath(`/gestore/${slug}`);
  redirect(`/gestore/${slug}`);
}

// Un torneo con risultati collegati non si può eliminare (il vincolo su participations lo impedisce): va annullato.
export async function deleteTournament(slug: string, id: string): Promise<void> {
  const ctx = await managedShop(slug);
  if (!ctx || !UUID.test(id)) return;

  const { error } = await ctx.supabase.from("tournaments").delete().eq("id", id).eq("shop_id", ctx.shopId);
  if (error) redirect(`/gestore/${slug}?errore=elimina`);

  revalidatePath(`/gestore/${slug}`);
  redirect(`/gestore/${slug}`);
}
