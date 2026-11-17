"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(fd: FormData, key: string, max: number) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalizeUrl(raw: string): string | null | "invalid" {
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

export async function submitRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sessione scaduta: accedi di nuovo." };
  const uid = auth.user.id;

  const { count: pending } = await supabase
    .from("shop_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("status", "pending");
  if ((pending ?? 0) > 0) return { error: "Hai già una richiesta in attesa di approvazione." };

  const mode = text(fd, "mode", 10);

  if (mode === "existing") {
    const shopId = text(fd, "shop_id", 40);
    if (!UUID.test(shopId)) return { error: "Scegli un negozio." };

    const { data: shop } = await supabase.from("shops").select("id").eq("id", shopId).maybeSingle();
    if (!shop) return { error: "Negozio non trovato." };

    const { data: member } = await supabase
      .from("shop_members")
      .select("shop_id")
      .eq("shop_id", shopId)
      .eq("user_id", uid)
      .maybeSingle();
    if (member) return { error: "Gestisci già questo negozio." };

    const { error } = await supabase.from("shop_requests").insert({ user_id: uid, shop_id: shopId });
    if (error) return { error: "Non sono riuscito a inviare la richiesta." };
  } else if (mode === "new") {
    const name = text(fd, "name", 80);
    const city = text(fd, "city", 60);
    const province = text(fd, "province", 2).toUpperCase();
    const address = text(fd, "address", 120);
    const phone = text(fd, "phone", 30);
    const description = text(fd, "description", 1000);
    const website = normalizeUrl(text(fd, "website", 200));

    if (!/[a-z0-9]/i.test(name)) return { error: "Inserisci il nome del negozio." };
    if (!city) return { error: "Inserisci la città." };
    if (!/^[A-Z]{2}$/.test(province)) return { error: "La provincia deve essere di 2 lettere (es. MI)." };
    if (website === "invalid") return { error: "Il sito web non è valido." };

    const { error } = await supabase.from("shop_requests").insert({
      user_id: uid,
      proposed: {
        name,
        city,
        province,
        address: address || null,
        phone: phone || null,
        website,
        description: description || null,
      },
    });
    if (error) return { error: "Non sono riuscito a inviare la richiesta." };
  } else {
    return { error: "Scegli se gestire un negozio esistente o registrarne uno nuovo." };
  }

  revalidatePath("/negozi/richiesta");
  return { ok: true };
}
