export type DeckCard = { card_code: string; qty: number };

export type ParsedDecklist = {
  cards: DeckCard[];
  // Leader trovato nella lista (solo se si passano i codici dei leader); le sue carte non entrano in `cards` né nel totale.
  leaderCode: string | null;
  total: number;
  errors: string[];
};

export const DECK_SIZE = 50;

// Righe accettate: "4x OP01-001", "4 OP01-001", "4 OP01-001 Nome carta".
// Righe vuote e commenti (# o //) vengono ignorati.
const LINE = /^(\d{1,2})\s*x?\s*([A-Za-z]{1,4}\d{0,2}-\d{3})\b/i;

// requireFull: true (predefinito) pretende esattamente 50 carte, come per il risultato di un torneo;
// false accetta anche un mazzo incompleto (bozza nel deckbuilder).
// leaderCodes: se la lista include anche il leader (1 copia), lo riconosce da qui e lo toglie dal conteggio.
export function parseDecklist(
  text: string,
  { requireFull = true, leaderCodes }: { requireFull?: boolean; leaderCodes?: ReadonlySet<string> } = {},
): ParsedDecklist {
  const byCode = new Map<string, number>();
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;

    const m = LINE.exec(line);
    if (!m) {
      errors.push(`Riga ${i + 1}: formato non riconosciuto ("${line.slice(0, 40)}")`);
      return;
    }
    const qty = Number(m[1]);
    const code = m[2].toUpperCase();
    if (qty < 1) {
      errors.push(`Riga ${i + 1}: quantità non valida`);
      return;
    }
    byCode.set(code, (byCode.get(code) ?? 0) + qty);
  });

  let cards = [...byCode].map(([card_code, qty]) => ({ card_code, qty }));
  let leaderCode: string | null = null;
  if (leaderCodes && errors.length === 0) {
    const found = cards.filter((c) => leaderCodes.has(c.card_code));
    if (found.length > 1) {
      errors.push(`La lista contiene più di un leader (${found.map((c) => c.card_code).join(", ")})`);
    } else if (found.length === 1) {
      if (found[0].qty !== 1) errors.push(`${found[0].card_code}: il leader va indicato una sola volta`);
      leaderCode = found[0].card_code;
      cards = cards.filter((c) => c.card_code !== leaderCode);
    }
  }
  const total = cards.reduce((sum, c) => sum + c.qty, 0);

  if (errors.length === 0 && cards.length > 0 && (requireFull ? total !== DECK_SIZE : total > DECK_SIZE)) {
    errors.push(
      requireFull
        ? `Il mazzo deve avere ${DECK_SIZE} carte (leader escluso): ne ho contate ${total}`
        : `Il mazzo non può avere più di ${DECK_SIZE} carte (leader escluso): ne ho contate ${total}`,
    );
  }

  return { cards, leaderCode, total, errors };
}
