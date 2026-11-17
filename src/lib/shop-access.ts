import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function isAdmin(supabase: Supabase, uid: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
  return !!data?.is_admin;
}

// L'utente può gestire il negozio (modifica e tornei) se ne è membro oppure se è admin.
// Le regole del database restano l'ultima difesa: qui si evitano scritture "silenziose" da 0 righe
// e si nasconde la pagina a chi non ha accesso.
export async function canManageShop(supabase: Supabase, shopId: string, uid: string): Promise<boolean> {
  const [{ data: member }, { data: me }] = await Promise.all([
    supabase.from("shop_members").select("role").eq("shop_id", shopId).eq("user_id", uid).maybeSingle(),
    supabase.from("profiles").select("is_admin").eq("id", uid).maybeSingle(),
  ]);
  return !!member || !!me?.is_admin;
}
