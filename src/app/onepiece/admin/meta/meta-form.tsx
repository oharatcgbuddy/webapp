"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { CARD_RATIO, cardImageUrl } from "@/lib/card-images";
import { saveMeta, type ActionState } from "./actions";

export type MetaLeader = { card_code: string; name: string; image_path: string | null };

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";

function Mini({ leader }: { leader: MetaLeader }) {
  const src = cardImageUrl(leader.image_path, "thumb");
  return (
    <span className="block aspect-[5/7] w-10 shrink-0 overflow-hidden border-2 border-ink bg-brand-pink">
      {src && (
        <Image
          unoptimized
          src={src}
          alt=""
          width={CARD_RATIO.width}
          height={CARD_RATIO.height}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}

export function MetaForm({ leaders, initial }: { leaders: MetaLeader[]; initial: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveMeta, {});
  const [selected, setSelected] = useState<string[]>(initial);
  const [query, setQuery] = useState("");

  const byCode = new Map(leaders.map((l) => [l.card_code, l]));
  const q = query.trim().toLowerCase();
  const results = q
    ? leaders
        .filter(
          (l) =>
            !selected.includes(l.card_code) &&
            (l.name.toLowerCase().includes(q) || l.card_code.toLowerCase().includes(q)),
        )
        .slice(0, 8)
    : [];

  const move = (i: number, d: -1 | 1) =>
    setSelected((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <form action={action} className="space-y-4">
      <section className="brutal-card space-y-3 p-4">
        <h2 className="font-black uppercase">In meta ora ({selected.length}/40)</h2>
        {selected.length === 0 ? (
          <p className="text-sm">Nessun leader selezionato: nel selettore non comparirà il riquadro &quot;In meta&quot;.</p>
        ) : (
          <ol className="space-y-2">
            {selected.map((code, i) => {
              const l = byCode.get(code);
              if (!l) return null;
              return (
                <li key={code} className="space-y-2 border-[3px] border-ink bg-white p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-sm font-black">{i + 1}</span>
                    <Mini leader={l} />
                    <span className="min-w-0 flex-1 text-sm font-bold leading-tight">
                      {l.card_code}
                      <span className="block font-medium">{l.name}</span>
                    </span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`Sposta in alto ${l.card_code}`}
                      className="brutal-btn px-4 py-2 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === selected.length - 1}
                      aria-label={`Sposta in basso ${l.card_code}`}
                      className="brutal-btn px-4 py-2 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected((s) => s.filter((c) => c !== code))}
                      aria-label={`Togli ${l.card_code}`}
                      className="brutal-btn bg-brand-red px-4 py-2"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="brutal-card space-y-2 p-4">
        <label className="block text-sm font-bold uppercase">
          Aggiungi un leader
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome o codice"
            className={field}
          />
        </label>
        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map((l) => (
              <li key={l.card_code}>
                <button
                  type="button"
                  disabled={selected.length >= 40}
                  onClick={() => {
                    setSelected((s) => [...s, l.card_code]);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 border-[3px] border-ink bg-white p-2 text-left disabled:opacity-40"
                >
                  <Mini leader={l} />
                  <span className="text-sm font-bold">
                    + {l.card_code} · {l.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && results.length === 0 && <p className="text-sm">Nessun leader trovato (o già in elenco).</p>}
      </section>

      <input type="hidden" name="codes" value={JSON.stringify(selected)} />

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}
      {state.ok && !pending && (
        <p role="status" className="border-[3px] border-ink bg-brand-green p-3 font-bold">
          Elenco salvato.
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Salvo…" : "Salva elenco meta"}
      </button>
    </form>
  );
}
