"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseShopFields } from "@/lib/shop-fields";

export type ActionState = { error?: string; ok?: boolean; message?: string; slug?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Il controllo admin è nelle funzioni SQL (security definer): qui si valida e si inoltra la chiamata.

export async function createShopAsAdmin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseShopFields(fd);
  if ("error" in parsed) return { error: parsed.error };
  const v = parsed.values;

  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("admin_create_shop", {
    p_name: v.name,
    p_city: v.city,
    p_province: v.province,
    p_address: v.address,
    p_phone: v.phone,
    p_website: v.website,
    p_description: v.description,
    p_social: v.social,
    p_lat: v.lat,
    p_lng: v.lng,
  });
  if (error || typeof slug !== "string") {
    return { error: error?.code === "42501" ? "Non sei autorizzato." : "Non sono riuscito a creare il negozio." };
  }

  revalidatePath("/admin/negozi");
  revalidatePath("/mappa");
  // Niente redirect qui: il modulo carica prima l'eventuale logo (serve l'id del negozio appena creato)
  // e poi porta alla pagina del negozio.
  return { ok: true, slug };
}

export async function addOwner(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!SLUG.test(slug)) return { error: "Negozio non valido." };
  const raw = fd.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) return { error: "Inserisci un'email valida." };

  const supabase = await createClient();
  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) return { error: "Negozio non trovato." };

  const { data, error } = await supabase.rpc("admin_add_shop_owner", { p_shop: shop.id, p_email: email });
  if (error) {
    return { error: error.code === "42501" ? "Non sei autorizzato." : "Non sono riuscito ad aggiungere il gestore." };
  }

  revalidatePath(`/admin/negozi/${slug}`);
  return {
    ok: true,
    message:
      data === "added"
        ? "Aggiunto: ora può gestire il negozio."
        : "Invito in attesa: diventerà gestore al primo accesso con questa email.",
  };
}

export async function removeMember(slug: string, fd: FormData): Promise<void> {
  const shop = fd.get("shop");
  const user = fd.get("user");
  if (!SLUG.test(slug) || typeof shop !== "string" || typeof user !== "string") return;
  if (!UUID.test(shop) || !UUID.test(user)) return;

  const supabase = await createClient();
  await supabase.rpc("admin_remove_shop_member", { p_shop: shop, p_user: user });
  revalidatePath(`/admin/negozi/${slug}`);
}

export async function cancelInvite(slug: string, fd: FormData): Promise<void> {
  const invite = fd.get("invite");
  if (!SLUG.test(slug) || typeof invite !== "string" || !UUID.test(invite)) return;

  const supabase = await createClient();
  await supabase.rpc("admin_cancel_shop_invite", { p_invite: invite });
  revalidatePath(`/admin/negozi/${slug}`);
}
