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
const SEARCH_VISIBLE = 12;

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

// Selezione del leader. In cima i leader "in meta" (scelti dall'admin) come riquadri da toccare;
// cercando, o con "Sfoglia tutti", tutti i leader compaiono come riquadri con l'immagine.
// Il menù a tendina resta come alternativa rapida: i leader sono centinaia.
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
  const [browseAll, setBrowseAll] = useState(false);
  const [moreResults, setMoreResults] = useState(false);

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

  // Riquadri sotto la ricerca: i risultati se si sta cercando, altrimenti tutti se si sceglie di sfogliare.
  const grid = q ? (moreResults ? filtered : filtered.slice(0, SEARCH_VISIBLE)) : browseAll ? leaders : [];
  const hiddenResults = q && !moreResults ? filtered.length - grid.length : 0;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-bold uppercase">{label}</span>

      {meta.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase">In meta ora</p>
          <div className="grid grid-cols-3 gap-2">
            {metaShown.map((l) => (
              <Tile key={l.card_code} leader={l} active={l.card_code === value} onPick={() => setValue(l.card_code)} eager />
            ))}
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
        onChange={(e) => {
          setQuery(e.target.value);
          setMoreResults(false);
        }}
        placeholder="Cerca per nome o codice"
        aria-label={`Filtra ${label}`}
        className={field}
      />

      {q && filtered.length === 0 && <p className="text-sm">Nessun leader trovato.</p>}

      {grid.length > 0 && (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-2">
            {grid.map((l) => (
              <Tile key={l.card_code} leader={l} active={l.card_code === value} onPick={() => setValue(l.card_code)} />
            ))}
          </div>
          {hiddenResults > 0 && (
            <button type="button" onClick={() => setMoreResults(true)} className="text-sm font-bold underline">
              Mostra altri {hiddenResults}
            </button>
          )}
        </div>
      )}

      {!q && (
        <button type="button" onClick={() => setBrowseAll((v) => !v)} className="text-sm font-bold underline">
          {browseAll ? "Nascondi l'elenco con le immagini" : `Sfoglia tutti i leader con le immagini (${leaders.length})`}
        </button>
      )}

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
            <Thumb leader={selected} eager />
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
