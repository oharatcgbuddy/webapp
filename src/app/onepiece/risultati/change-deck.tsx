import { changeDeck } from "./[id]/actions";

export type DeckOption = { id: string; name: string; leader_code: string | null };

// Scelta del mazzo usato in un torneo (track in corso o risultato chiuso). Funziona anche senza JavaScript.
export function ChangeDeck({
  participationId,
  currentDeckId,
  decks,
}: {
  participationId: string;
  currentDeckId: string | null;
  decks: DeckOption[];
}) {
  if (decks.length === 0) {
    return (
      <section className="brutal-card space-y-1 p-4">
        <h3 className="font-black uppercase">Mazzo usato</h3>
        <p className="text-sm">Non hai ancora mazzi: creane uno dalla sezione Mazzi per collegarlo a questo torneo.</p>
      </section>
    );
  }

  return (
    <form action={changeDeck.bind(null, participationId)} className="brutal-card space-y-3 p-4">
      <h3 className="font-black uppercase">Mazzo usato</h3>
      <select
        name="deck_id"
        required
        defaultValue={currentDeckId ?? ""}
        aria-label="Mazzo usato nel torneo"
        className="block w-full border-[3px] border-ink bg-white px-3 py-2"
      >
        {!currentDeckId && (
          <option value="" disabled>
            Scegli un mazzo…
          </option>
        )}
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.leader_code ? ` · ${d.leader_code}` : ""}
          </option>
        ))}
      </select>
      <button type="submit" className="brutal-btn w-full bg-white">
        Cambia mazzo
      </button>
      <p className="text-xs">
        Cambia anche il leader del torneo. Il torneo usa il mazzo così com&apos;è: se lo modifichi dopo nel deckbuilder, cambia
        anche qui.
      </p>
    </form>
  );
}
