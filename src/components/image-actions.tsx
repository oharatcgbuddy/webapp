"use client";

import { useEffect, useState } from "react";

type Kind = "mazzo" | "risultato" | "torneo";
type Fmt = "post" | "storia" | "libero";

const FORMATS: { id: Fmt; label: string }[] = [
  { id: "post", label: "Post" },
  { id: "storia", label: "Storia" },
  { id: "libero", label: "Intera" },
];

// Crea l'immagine (dal servizio sul server), la mostra in anteprima e permette di condividerla o scaricarla.
export function ImageActions({ kind, id, title = "Crea immagine" }: { kind: Kind; id: string; title?: string }) {
  const [busy, setBusy] = useState<Fmt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);

  // Libera l'anteprima precedente quando se ne crea una nuova o si esce.
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  async function create(fmt: Fmt) {
    setBusy(fmt);
    setError(null);
    try {
      const res = await fetch(`/api/immagini/${kind}/${id}?formato=${fmt}`, { cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Non sono riuscito a creare l'immagine. Riprova.");
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], `ohara-${kind}-${fmt}.png`, { type: "image/png" });
      setShot({ url: URL.createObjectURL(blob), file });
    } catch {
      setError("Non sono riuscito a creare l'immagine. Controlla la connessione e riprova.");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!shot) return;
    try {
      if (navigator.canShare?.({ files: [shot.file] })) {
        await navigator.share({ files: [shot.file] });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // chiuso dall'utente
    }
    download();
  }

  function download() {
    if (!shot) return;
    const a = document.createElement("a");
    a.href = shot.url;
    a.download = shot.file.name;
    a.click();
  }

  return (
    <section className="brutal-card space-y-3 p-4">
      <h3 className="font-black uppercase">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => create(f.id)}
            disabled={busy !== null}
            className="brutal-btn bg-brand-yellow px-2 disabled:opacity-60"
          >
            {busy === f.id ? "…" : f.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {error}
        </p>
      )}
      {shot && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="Anteprima dell'immagine" className="mx-auto max-h-[70vh] w-auto border-[3px] border-ink" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={share} className="brutal-btn bg-brand-green">
              Condividi
            </button>
            <button type="button" onClick={download} className="brutal-btn bg-white">
              Scarica
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
