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

const field = "block w-full border-[3px] border-ink bg-white px-3 py-2";
const META_VISIBLE = 9;

// Immagine del leader; se manca, un riquadro con il codice.
function Thumb({ leader, eager = false }: { leader: LeaderOpt; eager?: boolean }) {
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
      loading={eager ? "eager" : "lazy"}
      className="h-full w-full object-cover"
    />
  );
}

function Tile({
  leader,
  active,
  onPick,
  eager = false,
}: {
  leader: LeaderOpt;
  active: boolean;
  onPick: () => void;
  eager?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-label={`${leader.card_code} ${leader.name}`}
      className={`flex min-h-14 flex-col overflow-hidden border-[3px] border-ink text-left ${
        active ? "bg-brand-yellow shadow-brutal" : "bg-white"
      }`}
    >
      <span className="block aspect-[5/7] w-full overflow-hidden border-b-[3px] border-ink">
        <Thumb leader={leader} eager={eager} />
      </span>
      <span className="block px-1 py-1 text-[11px] font-bold leading-tight">
        {leader.card_code}
        <span className="block truncate font-medium">{leader.name}</span>
      </span>
    </button>
  );
}

// Selezione del leader: barra di ricerca e, sopra l'elenco, i leader "in meta" (scelti dall'admin)
// come riquadri con l'immagine. Gli altri leader compaiono solo cercando, sempre come riquadri.
export function LeaderPicker({
  name,
  label,
  leaders,
  required = true,
  onChange,
}: {
  name: string;
  label: string;
  leaders: LeaderOpt[];
  required?: boolean;
  // Per chi tiene il valore in uno stato proprio (es. i round del modulo manuale).
  onChange?: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [showAllMeta, setShowAllMeta] = useState(false);

  // Si può togliere la scelta solo se il leader è facoltativo.
  const pick = (code: string) => {
    const next = value === code && !required ? "" : code;
    setValue(next);
    onChange?.(next);
  };

  const meta = leaders
    .filter((l) => l.meta_position != null)
    .sort((a, b) => (a.meta_position ?? 0) - (b.meta_position ?? 0));
  const metaShown = showAllMeta ? meta : meta.slice(0, META_VISIBLE);

  const q = query.trim().toLowerCase();
  const matches = q
    ? leaders.filter((l) => l.name.toLowerCase().includes(q) || l.card_code.toLowerCase().includes(q))
    : [];
  const selected = leaders.find((l) => l.card_code === value);

  return (
    <div className="space-y-3">
      <span className="block text-sm font-bold uppercase">{label}</span>

      {/* Il valore inviato con il form. */}
      <input type="hidden" name={name} value={value} />

      {selected && (
        <div
          role="status"
          className="flex items-center gap-3 border-[3px] border-ink bg-brand-yellow p-2 shadow-brutal"
        >
          <span className="block aspect-[5/7] w-12 shrink-0 overflow-hidden border-2 border-ink">
            <Thumb leader={selected} eager />
          </span>
          <p className="min-w-0 text-sm font-bold leading-tight">
            {selected.card_code}
            <span className="block font-medium">{selected.name}</span>
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome o codice"
          aria-label={`Cerca ${label}`}
          className={field}
        />
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setShowAllMeta(false);
          }}
          disabled={!query && !showAllMeta}
          className="shrink-0 border-[3px] border-ink bg-white px-3 text-sm font-bold disabled:opacity-40"
        >
          Reset filtri
        </button>
      </div>

      {!q && meta.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase">In meta ora</p>
          <div className="grid grid-cols-3 gap-2">
            {metaShown.map((l) => (
              <Tile key={l.card_code} leader={l} active={l.card_code === value} onPick={() => pick(l.card_code)} eager />
            ))}
          </div>
          {meta.length > META_VISIBLE && (
            <button type="button" onClick={() => setShowAllMeta((v) => !v)} className="text-sm font-bold underline">
              {showAllMeta ? "Mostra meno" : `Mostra tutti (${meta.length})`}
            </button>
          )}
        </div>
      )}

      {/* Nessun elenco finché non si cerca: i risultati compaiono solo scrivendo nella ricerca. */}
      {q && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase">Risultati ({matches.length})</p>
          {matches.length === 0 ? (
            <p className="text-sm">Nessun leader trovato.</p>
          ) : (
            <div className="grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto border-[3px] border-ink bg-white p-2">
              {matches.map((l) => (
                <Tile key={l.card_code} leader={l} active={l.card_code === value} onPick={() => pick(l.card_code)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
