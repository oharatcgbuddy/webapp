"use client";

import { createClient } from "@/lib/supabase/client";
import { SHOP_LOGO_MAX_BYTES } from "@/lib/shop-logo";
import { setShopLogo } from "./actions";

const MAX_SIDE = 512;

// Ridimensiona nel browser (lato lungo 512 px) e converte in WebP sotto i 512 KB.
async function toWebp(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  for (const q of [0.9, 0.8, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", q));
    if (blob && blob.size <= SHOP_LOGO_MAX_BYTES) return blob;
  }
  throw new Error("size");
}

// Carica il logo di un negozio (già esistente): lo ridimensiona, lo mette nel bucket sotto la cartella del
// negozio e salva il percorso. Restituisce il percorso, oppure il messaggio d'errore da mostrare.
export async function uploadShopLogo(slug: string, shopId: string, file: File): Promise<{ path: string } | { error: string }> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { error: "Usa un'immagine PNG, JPG o WebP." };
  let blob: Blob;
  try {
    blob = await toWebp(file);
  } catch {
    return { error: "Non riesco a leggere questa immagine. Prova con un altro file." };
  }
  const path = `${shopId}/logo-${Date.now()}.webp`;
  const { error } = await createClient().storage.from("shop-logos").upload(path, blob, { contentType: "image/webp" });
  if (error) return { error: "Non sono riuscito a caricare il logo. Riprova." };
  const res = await setShopLogo(slug, path);
  return res.error ? { error: res.error } : { path };
}

// Per un negozio appena creato: se ne ricava l'id dal suo indirizzo (slug) e si carica il logo.
export async function uploadLogoBySlug(slug: string, file: File): Promise<string | null> {
  const { data: shop } = await createClient().from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) return "Negozio non trovato.";
  const res = await uploadShopLogo(slug, shop.id as string, file);
  return "error" in res ? res.error : null;
}
