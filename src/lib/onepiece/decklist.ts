export type DeckCard = { card_code: string; qty: number };

export type ParsedDecklist = {
  cards: DeckCard[];
  total: number;
  errors: string[];
};

export const DECK_SIZE = 50;

// Righe accettate: "4x OP01-001", "4 OP01-001", "4 OP01-001 Nome carta".
// Righe vuote e commenti (# o //) vengono ignorati.
const LINE = /^(\d{1,2})\s*x?\s*([A-Za-z]{1,4}\d{0,2}-\d{3})\b/i;

// requireFull: true (predefinito) pretende esattamente 50 carte, come per il risultato di un torneo;
// false accetta anche un mazzo incompleto (bozza nel deckbuilder).
export function parseDecklist(text: string, { requireFull = true }: { requireFull?: boolean } = {}): ParsedDecklist {
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

  const cards = [...byCode].map(([card_code, qty]) => ({ card_code, qty }));
  const total = cards.reduce((sum, c) => sum + c.qty, 0);

  if (errors.length === 0 && cards.length > 0 && (requireFull ? total !== DECK_SIZE : total > DECK_SIZE)) {
    errors.push(
      requireFull
        ? `Il mazzo deve avere ${DECK_SIZE} carte (leader escluso): ne ho contate ${total}`
        : `Il mazzo non può avere più di ${DECK_SIZE} carte (leader escluso): ne ho contate ${total}`,
    );
  }

  return { cards, total, errors };
}
