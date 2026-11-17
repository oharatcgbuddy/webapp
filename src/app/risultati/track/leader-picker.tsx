"use client";

import { useState } from "react";

export type LeaderOpt = { card_code: string; name: string };

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";

// Select con filtro di testo: i leader sono centinaia.
export function LeaderPicker({
  name,
  label,
  leaders,
}: {
  name: string;
  label: string;
  leaders: LeaderOpt[];
}) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? leaders.filter((l) => l.name.toLowerCase().includes(q) || l.card_code.toLowerCase().includes(q))
    : leaders;
  const selected = leaders.find((l) => l.card_code === value);
  const options =
    selected && !filtered.some((l) => l.card_code === value) ? [selected, ...filtered] : filtered;

  return (
    <div className="space-y-1">
      <span className="block text-sm font-bold uppercase">{label}</span>
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
        required
        aria-label={label}
        className={field}
      >
        <option value="">— scegli —</option>
        {options.map((l) => (
          <option key={l.card_code} value={l.card_code}>
            {l.card_code} · {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
