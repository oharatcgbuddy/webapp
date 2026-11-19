"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { romeLocalToIso } from "@/lib/datetime";
import { BANDAI_LINK_ERROR, BANDAI_SOURCE, parseBandaiEventLink } from "@/lib/bandai";
import { parseShopFields } from "@/lib/shop-fields";
import { parseBandaiOrganizerId, saveBandaiOrganizer } from "@/lib/shop-external-ids";
import { canManageShop, isAdmin } from "@/lib/shop-access";
import { shopLogoPathOk } from "@/lib/shop-logo";

// `claim`: l'evento Bandai è già un torneo della comunità e il gestore deve confermare il riscatto.
// `slug`: indirizzo del negozio appena creato (il modulo di creazione lo usa per caricare il logo e andare alla sua pagina).
export type ActionState = { error?: string; ok?: boolean; claim?: { title: string }; slug?: string };

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
  const organizer = parseBandaiOrganizerId(fd);
  if ("error" in organizer) return { error: organizer.error };

  const { data, error } = await ctx.supabase
    .from("shops")
    .update(parsed.values)
    .eq("id", ctx.shopId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Non sono riuscito a salvare le modifiche." };

  if (organizer.value !== undefined) {
    const orgError = await saveBandaiOrganizer(ctx.supabase, ctx.shopId, organizer.value);
    if (orgError) return { error: `Pagina salvata, ma: ${orgError}` };
  }

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

  // Evento Bandai già segnalato dai giocatori (torneo della comunità, senza locale): il locale lo può riscattare.
  // I risultati già registrati restano collegati. Se l'evento è di un altro locale, resta l'errore di prima.
  const v = parsed.values;
  if (v.external_id) {
    const { data: existing } = await ctx.supabase
      .from("tournaments")
      .select("id, title, shop_id")
      .eq("external_source", BANDAI_SOURCE)
      .eq("external_id", v.external_id)
      .maybeSingle();
    if (existing) {
      if (existing.shop_id) return { error: LINK_TAKEN };
      if (text(fd, "claim", 1) !== "1") return { claim: { title: existing.title as string } };
      const { error: claimErr } = await ctx.supabase.rpc("claim_community_tournament", {
        p_shop: ctx.shopId,
        p_external_id: v.external_id,
        p_title: v.title,
        p_starts_at: v.starts_at,
        p_format_slug: v.format_slug,
        p_entry_fee_cents: v.entry_fee_cents,
        p_max_players: v.max_players,
        p_prizes: v.prizes,
        p_notes: v.notes,
        p_status: v.status,
      });
      if (claimErr) return { error: "Non sono riuscito a riscattare il torneo. Riprova." };
      revalidatePath(`/gestore/${slug}`);
      redirect(`/gestore/${slug}`);
    }
  }

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

// Solo un admin: restituisce alla comunità un torneo riscattato per errore (titolo di prima, senza locale).
export async function releaseTournament(slug: string, id: string): Promise<void> {
  const ctx = await managedShop(slug);
  if (!ctx || !UUID.test(id) || !(await isAdmin(ctx.supabase, ctx.uid))) return;

  const { error } = await ctx.supabase.rpc("release_claimed_tournament", { p_tournament: id });
  if (error) redirect(`/gestore/${slug}/tornei/${id}?errore=restituisci`);

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
