"use client";

import { useRef, useState, useTransition } from "react";
import { shopLogoUrl } from "@/lib/shop-logo";
import { uploadShopLogo } from "./logo-utils";

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
      const res = await uploadShopLogo(slug, shopId, file);
      if ("error" in res) setError(res.error);
      else setPath(res.path);
      if (input.current) input.current.value = "";
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
