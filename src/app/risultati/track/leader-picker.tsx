"use client";

import { useState } from "react";
import Image from "next/image";
import { CARD_RATIO, cardImageUrl } from "@/lib/card-images";

export type LeaderOpt = {
  card_code: string;
  name: string;
  image_path?: string | null;
  meta_position?: number | null;
};

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const META_VISIBLE = 9;

// Immagine del leader; se manca, un riquadro con il codice.
function Thumb({ leader }: { leader: LeaderOpt }) {
  const src = cardImageUrl(leader.image_path, "thumb");
  if (!src) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-brand-pink px-1 text-center text-xs font-black">
        {leader.card_code}
      </span>
    );
  }
  return (
    <Image
      unoptimized
      src={src}
      alt=""
      width={CARD_RATIO.width}
      height={CARD_RATIO.height}
      className="h-full w-full object-cover"
    />
  );
}

// Selezione del leader: in cima i leader "in meta" (scelti dall'admin) come riquadri da toccare,
// sotto la ricerca con elenco completo: i leader sono centinaia.
export function LeaderPicker({
  name,
  label,
  leaders,
  required = true,
}: {
  name: string;
  label: string;
  leaders: LeaderOpt[];
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [showAllMeta, setShowAllMeta] = useState(false);

  const meta = leaders
    .filter((l) => l.meta_position != null)
    .sort((a, b) => (a.meta_position ?? 0) - (b.meta_position ?? 0));
  const metaShown = showAllMeta ? meta : meta.slice(0, META_VISIBLE);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? leaders.filter((l) => l.name.toLowerCase().includes(q) || l.card_code.toLowerCase().includes(q))
    : leaders;
  const selected = leaders.find((l) => l.card_code === value);
  const options =
    selected && !filtered.some((l) => l.card_code === value) ? [selected, ...filtered] : filtered;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-bold uppercase">{label}</span>

      {meta.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase">In meta ora</p>
          <div className="grid grid-cols-3 gap-2">
            {metaShown.map((l) => {
              const active = l.card_code === value;
              return (
                <button
                  key={l.card_code}
                  type="button"
                  onClick={() => setValue(l.card_code)}
                  aria-pressed={active}
                  aria-label={`${l.card_code} ${l.name}`}
                  className={`flex min-h-14 flex-col overflow-hidden border-[3px] border-ink text-left ${
                    active ? "bg-brand-yellow shadow-brutal" : "bg-white"
                  }`}
                >
                  <span className="block aspect-[5/7] w-full overflow-hidden border-b-[3px] border-ink">
                    <Thumb leader={l} />
                  </span>
                  <span className="block px-1 py-1 text-[11px] font-bold leading-tight">
                    {l.card_code}
                    <span className="block truncate font-medium">{l.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {meta.length > META_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAllMeta((v) => !v)}
              className="text-sm font-bold underline"
            >
              {showAllMeta ? "Mostra meno" : `Mostra tutti (${meta.length})`}
            </button>
          )}
        </div>
      )}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca per nome o codice"
        aria-label={`Filtra ${label}`}
        className={field}
      />
      <select
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        aria-label={label}
        className={field}
      >
        <option value="">{required ? "— scegli —" : "— nessuno —"}</option>
        {options.map((l) => (
          <option key={l.card_code} value={l.card_code}>
            {l.card_code} · {l.name}
          </option>
        ))}
      </select>

      {selected && (
        <div className="flex items-center gap-3 border-[3px] border-ink bg-white p-2">
          <span className="block aspect-[5/7] w-14 shrink-0 overflow-hidden border-2 border-ink">
            <Thumb leader={selected} />
          </span>
          <p className="min-w-0 text-sm font-bold leading-tight">
            {selected.card_code}
            <span className="block font-medium">{selected.name}</span>
          </p>
        </div>
      )}
    </div>
  );
}
