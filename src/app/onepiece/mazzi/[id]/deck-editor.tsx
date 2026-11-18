"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { CARD_RATIO, cardImageUrl } from "@/lib/card-images";
import {
  DECK_SIZE,
  MAX_COPIES,
  checkDeck,
  deckToText,
  deckTotal,
  entriesToCards,
  type CatalogCard,
  type DeckEntries,
} from "@/lib/onepiece/deck-rules";
import { parseDecklist } from "@/lib/onepiece/decklist";
import { deleteDeck, saveDeck } from "../actions";

type Leader = { card_code: string; name: string; colors: string[]; image_path: string | null };
type Msg = { ok: boolean; text: string } | null;

const field = "block w-full border-[3px] border-ink bg-white px-3 py-2";
const VISIBLE = 30;
const TYPES = ["Character", "Event", "Stage"] as const;
const TYPE_IT: Record<string, string> = { Character: "Personaggio", Event: "Evento", Stage: "Stage" };
const COLOR_IT: Record<string, string> = { Red: "Rosso", Green: "Verde", Blue: "Blu", Purple: "Viola", Black: "Nero", Yellow: "Giallo" };
const COSTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const snap = (name: string, entries: DeckEntries) => `${name}|${JSON.stringify(entriesToCards(entries))}`;

function Thumb({ path, code }: { path: string | null | undefined; code: string }) {
  const src = cardImageUrl(path, "thumb");
  if (!src) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-brand-pink px-1 text-center text-xs font-black">{code}</span>
    );
  }
  return <Image unoptimized src={src} alt="" width={CARD_RATIO.width} height={CARD_RATIO.height} className="h-full w-full object-cover" />;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border-2 border-ink px-3 py-1 text-sm font-bold ${active ? "bg-brand-yellow shadow-brutal" : "bg-white"}`}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function DeckEditor({
  deckId,
  initialName,
  leader,
  catalog,
  initialEntries,
  deleteError,
}: {
  deckId: string;
  initialName: string;
  leader: Leader;
  catalog: CatalogCard[];
  initialEntries: DeckEntries;
  deleteError: boolean;
}) {
  const byCode = useMemo(() => new Map(catalog.map((c) => [c.card_code, c])), [catalog]);
  const [name, setName] = useState(initialName);
  const [entries, setEntries] = useState<DeckEntries>(initialEntries);
  const [saved, setSaved] = useState(() => snap(initialName, initialEntries));
  const [q, setQ] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [colorSel, setColorSel] = useState<string[]>([]);
  const [typeSel, setTypeSel] = useState<string[]>([]);
  const [costSel, setCostSel] = useState<number[]>([]);
  const [limit, setLimit] = useState(VISIBLE);
  const [msg, setMsg] = useState<Msg>(null);
  const [importText, setImportText] = useState("");
  const [copied, setCopied] = useState<"" | "ok" | "err">("");
  const [pending, startTransition] = useTransition();

  const total = deckTotal(entries);
  const dirty = snap(name, entries) !== saved;
  const check = useMemo(() => checkDeck(entries, byCode, leader.colors), [entries, byCode, leader.colors]);

  // Avvisa se si esce con modifiche non salvate.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const sets = useMemo(
    () => [...new Set(catalog.filter((c) => c.type !== "Leader" && c.set_code).map((c) => c.set_code as string))].sort(),
    [catalog],
  );

  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = useMemo(
    () =>
      catalog.filter((c) => {
        if (c.type === "Leader") return false;
        if (setFilter && c.set_code !== setFilter) return false;
        if (colorSel.length && !c.colors.some((x) => colorSel.includes(x))) return false;
        if (typeSel.length && !(c.type && typeSel.includes(c.type))) return false;
        if (costSel.length && (c.cost === null || !costSel.includes(c.cost))) return false;
        if (tokens.length) {
          const hay = `${c.card_code} ${c.name} ${c.traits.join(" ")}`.toLowerCase();
          if (!tokens.every((t) => hay.includes(t))) return false;
        }
        return true;
      }),
    // `tokens` deriva da `q`: basta dipendere da q.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, setFilter, colorSel, typeSel, costSel, q],
  );

  const filterChange = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setLimit(VISIBLE);
  };

  const add = (code: string) => {
    const qty = entries[code] ?? 0;
    if (qty >= MAX_COPIES) return setMsg({ ok: false, text: `Al massimo ${MAX_COPIES} copie di ${code}.` });
    if (total >= DECK_SIZE) return setMsg({ ok: false, text: `Il mazzo è già a ${DECK_SIZE} carte.` });
    setMsg(null);
    setEntries((e) => ({ ...e, [code]: qty + 1 }));
  };
  const sub = (code: string) =>
    setEntries((e) => {
      const next = { ...e };
      const qty = (e[code] ?? 0) - 1;
      if (qty <= 0) delete next[code];
      else next[code] = qty;
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const res = await saveDeck(deckId, name, entriesToCards(entries));
      if (res.ok) {
        setSaved(snap(name, entries));
        setMsg({ ok: true, text: "Mazzo salvato." });
      } else {
        setMsg({ ok: false, text: res.error ?? "Non sono riuscito a salvare." });
      }
    });

  // Copia negli appunti il mazzo nel formato "4xOP01-013", una carta per riga.
  // L'esito si vede sul pulsante stesso, che sta in fondo alla pagina.
  const copy = async () => {
    let result: "ok" | "err" = "ok";
    try {
      await navigator.clipboard.writeText(deckToText(entries));
    } catch {
      result = "err";
    }
    setCopied(result);
    setTimeout(() => setCopied(""), 2500);
  };

  const doImport = () => {
    const parsed = parseDecklist(importText, { requireFull: false });
    if (parsed.errors.length) return setMsg({ ok: false, text: parsed.errors[0] });
    if (parsed.cards.length === 0) return setMsg({ ok: false, text: "Incolla almeno una riga, per esempio 4xOP01-013." });
    const next: DeckEntries = {};
    for (const c of parsed.cards) next[c.card_code] = c.qty;
    const c2 = checkDeck(next, byCode, leader.colors);
    if (c2.errors.length) return setMsg({ ok: false, text: c2.errors[0].replace("carta sconosciuta", "carta non disponibile per questo leader") });
    setEntries(next);
    setImportText("");
    setMsg({ ok: true, text: "Importato: controlla e salva." });
  };

  const deckList = entriesToCards(entries).sort((a, b) => {
    const ca = byCode.get(a.card_code)?.cost ?? 99;
    const cb = byCode.get(b.card_code)?.cost ?? 99;
    return ca - cb || a.card_code.localeCompare(b.card_code);
  });
  const byType: Record<string, number> = {};
  for (const [code, qty] of Object.entries(entries)) {
    const t = byCode.get(code)?.type ?? "Altro";
    byType[t] = (byType[t] ?? 0) + qty;
  }
  const leaderThumb = cardImageUrl(leader.image_path, "thumb");

  return (
    <main className="space-y-4 p-4">
      <div className="sticky top-0 z-[5] -mx-4 flex items-center gap-3 border-b-[3px] border-ink bg-paper px-4 py-2">
        <p className={`text-2xl font-black ${total === DECK_SIZE ? "text-ink" : ""}`} aria-label={`${total} carte su ${DECK_SIZE}`}>
          {total}/{DECK_SIZE}
        </p>
        <p className="min-w-0 flex-1 text-xs font-bold leading-tight">
          {TYPES.map((t) => `${TYPE_IT[t]} ${byType[t] ?? 0}`).join(" · ")}
          {dirty && <span className="block text-brand-red">Modifiche non salvate</span>}
        </p>
        <button type="button" onClick={save} disabled={pending || !dirty} className="brutal-btn bg-brand-green px-4 py-2 disabled:opacity-50">
          {pending ? "Salvo…" : "Salva"}
        </button>
      </div>

      {deleteError && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          Non sono riuscito a eliminare il mazzo: è probabilmente collegato a un risultato.
        </p>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`border-[3px] border-ink p-3 font-bold ${msg.ok ? "bg-brand-green" : "bg-brand-red"}`}>
          {msg.text}
        </p>
      )}

      <section className="brutal-card space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="block aspect-[5/7] w-16 shrink-0 overflow-hidden border-2 border-ink bg-brand-pink">
            {leaderThumb ? (
              <Image unoptimized src={leaderThumb} alt="" width={CARD_RATIO.width} height={CARD_RATIO.height} className="h-full w-full object-cover" />
            ) : null}
          </span>
          <p className="min-w-0 text-sm font-bold leading-tight">
            {leader.card_code}
            <span className="block font-medium">{leader.name}</span>
            <span className="block text-xs font-medium">{leader.colors.map((c) => COLOR_IT[c] ?? c).join(" / ")}</span>
          </p>
        </div>
        <label className="block text-sm font-bold uppercase">
          Nome del mazzo
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" className={`${field} mt-1 normal-case`} />
        </label>
        {check.errors.length > 0 && <p className="text-sm font-bold text-brand-red">{check.errors[0]}</p>}
        {check.errors.length === 0 && total === DECK_SIZE && <p className="text-sm font-bold">Mazzo completo: 50 carte.</p>}
        {check.errors.length === 0 && total < DECK_SIZE && <p className="text-sm">Mancano {DECK_SIZE - total} carte.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-black uppercase">Nel mazzo ({total})</h2>
        {deckList.length === 0 ? (
          <p className="brutal-card p-3 text-sm">Nessuna carta: tocca le carte qui sotto per aggiungerle.</p>
        ) : (
          <ul className="space-y-2">
            {deckList.map((c) => {
              const card = byCode.get(c.card_code);
              return (
                <li key={c.card_code} className="brutal-card flex items-center gap-2 p-2">
                  <span className="block aspect-[5/7] w-9 shrink-0 overflow-hidden border-2 border-ink bg-brand-pink">
                    <Thumb path={card?.image_path} code={c.card_code} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm font-bold leading-tight">
                    {card?.name ?? c.card_code}
                    <span className="block text-xs font-medium">
                      {c.card_code}
                      {card?.cost != null ? ` · costo ${card.cost}` : ""}
                    </span>
                  </p>
                  <button type="button" onClick={() => sub(c.card_code)} aria-label={`Togli una copia di ${c.card_code}`} className="brutal-btn px-3 py-1">
                    −
                  </button>
                  <span className="w-5 text-center font-black">{c.qty}</span>
                  <button type="button" onClick={() => add(c.card_code)} aria-label={`Aggiungi una copia di ${c.card_code}`} className="brutal-btn px-3 py-1">
                    +
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">Aggiungi carte</h2>
        <input
          type="search"
          value={q}
          onChange={(e) => filterChange(setQ)(e.target.value)}
          placeholder="Cerca per nome, codice o tratto"
          aria-label="Cerca carte"
          className={field}
        />
        <div className="grid grid-cols-2 gap-2">
          <select value={setFilter} onChange={(e) => filterChange(setSetFilter)(e.target.value)} aria-label="Set" className={field}>
            <option value="">Tutti i set</option>
            {sets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            {leader.colors.map((c) => (
              <Chip key={c} active={colorSel.includes(c)} onClick={() => filterChange(setColorSel)(toggle(colorSel, c))}>
                {COLOR_IT[c] ?? c}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Chip key={t} active={typeSel.includes(t)} onClick={() => filterChange(setTypeSel)(toggle(typeSel, t))}>
              {TYPE_IT[t]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Costo">
          {COSTS.map((n) => (
            <Chip key={n} active={costSel.includes(n)} onClick={() => filterChange(setCostSel)(toggle(costSel, n))}>
              {n}
            </Chip>
          ))}
        </div>

        <p className="text-sm font-bold">{results.length} carte</p>
        <div className="grid grid-cols-3 gap-2">
          {results.slice(0, limit).map((c) => {
            const qty = entries[c.card_code] ?? 0;
            return (
              <div key={c.card_code} className="relative">
                <button
                  type="button"
                  onClick={() => add(c.card_code)}
                  aria-label={`Aggiungi ${c.card_code} ${c.name}`}
                  className={`flex w-full flex-col overflow-hidden border-[3px] border-ink text-left ${qty > 0 ? "bg-brand-yellow" : "bg-white"}`}
                >
                  <span className="block aspect-[5/7] w-full overflow-hidden border-b-[3px] border-ink">
                    <Thumb path={c.image_path} code={c.card_code} />
                  </span>
                  <span className="block px-1 py-1 text-[11px] font-bold leading-tight">
                    {c.card_code}
                    {c.cost != null ? ` · ${c.cost}` : ""}
                    <span className="block truncate font-medium">{c.name}</span>
                  </span>
                </button>
                {qty > 0 && (
                  <>
                    <span className="absolute right-1 top-1 border-2 border-ink bg-brand-yellow px-1.5 text-xs font-black">{qty}</span>
                    <button
                      type="button"
                      onClick={() => sub(c.card_code)}
                      aria-label={`Togli una copia di ${c.card_code}`}
                      className="absolute left-1 top-1 border-2 border-ink bg-white px-2 text-sm font-black"
                    >
                      −
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {results.length > limit && (
          <button type="button" onClick={() => setLimit((n) => n + VISIBLE)} className="brutal-btn w-full bg-white">
            Mostra altre ({results.length - limit})
          </button>
        )}
        {results.length === 0 && <p className="text-sm">Nessuna carta con questi filtri.</p>}
      </section>

      <section className="brutal-card space-y-3 p-4">
        <h2 className="font-black uppercase">Testo del mazzo</h2>
        <button
          type="button"
          onClick={copy}
          disabled={total === 0}
          className={`brutal-btn w-full disabled:opacity-50 ${copied === "ok" ? "bg-brand-green" : copied === "err" ? "bg-brand-red" : "bg-white"}`}
        >
          {copied === "ok" ? `Copiato ✓ (${total} carte)` : copied === "err" ? "Non riesco a copiare" : "Copia il mazzo"}
        </button>
        <label className="block text-sm font-bold uppercase">
          Importa (sostituisce il mazzo)
          <textarea
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"4xOP01-013\n4xOP01-016\n1xEB05-021"}
            className={`${field} mt-1 font-mono text-xs normal-case`}
          />
        </label>
        <button type="button" onClick={doImport} disabled={!importText.trim()} className="brutal-btn w-full bg-white disabled:opacity-50">
          Importa
        </button>
      </section>

      <form
        action={deleteDeck}
        onSubmit={(e) => {
          if (!window.confirm("Eliminare questo mazzo? Non si può annullare.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={deckId} />
        <button type="submit" className="brutal-btn w-full bg-brand-red">
          Elimina mazzo
        </button>
      </form>
    </main>
  );
}
