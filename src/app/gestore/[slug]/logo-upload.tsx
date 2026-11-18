"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { SHOP_LOGO_MAX_BYTES, shopLogoUrl } from "@/lib/shop-logo";
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

export function LogoUpload({ slug, shopId, currentPath }: { slug: string; shopId: string; currentPath: string | null }) {
  const [path, setPath] = useState(currentPath);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const url = shopLogoUrl(path);

  function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
          setError("Usa un'immagine PNG, JPG o WebP.");
          return;
        }
        const blob = await toWebp(file);
        const newPath = `${shopId}/logo-${Date.now()}.webp`;
        const { error: upErr } = await createClient().storage.from("shop-logos").upload(newPath, blob, { contentType: "image/webp" });
        if (upErr) {
          setError("Non sono riuscito a caricare il logo. Riprova.");
          return;
        }
        const res = await setShopLogo(slug, newPath);
        if (res.error) setError(res.error);
        else setPath(newPath);
      } catch {
        setError("Non riesco a leggere questa immagine. Prova con un altro file.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <section className="brutal-card space-y-3 p-4">
      <h2 className="font-black uppercase">Logo del negozio</h2>
      <p className="text-sm">Compare nelle immagini dei risultati. PNG, JPG o WebP: lo ridimensiono io.</p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Logo attuale" className="h-24 w-24 border-[3px] border-ink bg-white object-contain" />
      ) : (
        <p className="text-sm font-bold">Nessun logo caricato.</p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={pending}
        onChange={(e) => onPick(e.target.files?.[0])}
        className="block w-full border-[3px] border-ink bg-white p-2 text-sm"
      />
      {pending && <p className="text-sm font-bold">Carico…</p>}
      {error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {error}
        </p>
      )}
    </section>
  );
}
