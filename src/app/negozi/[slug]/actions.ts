"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;

// Segue o smette di seguire un negozio. Lo stato attuale si rilegge dal
// database: non ci si fida di quello mostrato dal client.
export async function toggleFavorite(shopId: string, slug: string) {
  if (!UUID.test(shopId) || !SLUG.test(slug)) return;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { data: existing } = await supabase
    .from("shop_favorites")
    .select("shop_id")
    .eq("shop_id", shopId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("shop_favorites").delete().eq("shop_id", shopId).eq("user_id", auth.user.id);
  } else {
    await supabase.from("shop_favorites").insert({ shop_id: shopId, user_id: auth.user.id });
  }

  revalidatePath(`/negozi/${slug}`);
}
