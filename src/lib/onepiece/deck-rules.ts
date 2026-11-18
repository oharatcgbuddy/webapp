// Regole e utilità del mazzo One Piece, condivise tra l'editor (client) e il salvataggio (server).
// Il mazzo ha 50 carte (leader escluso), al massimo 4 copie per codice, e ogni carta deve avere almeno
// un colore in comune con il leader. Le carte senza dati ancora importati (colori vuoti) sono ammesse.

import { DECK_SIZE, type DeckCard } from "./decklist";

export { DECK_SIZE };
export const MAX_COPIES = 4;

export type CatalogCard = {
  card_code: string;
  name: string;
  type: string | null;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  rarity: string | null;
  set_code: string | null;
  image_path: string | null;
  traits: string[];
};

export type DeckEntries = Record<string, number>;

export function entriesFromCards(cards: DeckCard[]): DeckEntries {
  const out: DeckEntries = {};
  for (const c of cards) out[c.card_code] = (out[c.card_code] ?? 0) + c.qty;
  return out;
}

export function entriesToCards(entries: DeckEntries): DeckCard[] {
  return Object.entries(entries)
    .filter(([, qty]) => qty > 0)
    .map(([card_code, qty]) => ({ card_code, qty }))
    .sort((a, b) => a.card_code.localeCompare(b.card_code));
}

export const deckTotal = (entries: DeckEntries) => Object.values(entries).reduce((n, q) => n + q, 0);

// Una carta è ammessa se condivide un colore con il leader (o se non se ne conoscono ancora i colori).
export function colorsMatch(cardColors: string[], leaderColors: string[]): boolean {
  return cardColors.length === 0 || cardColors.some((c) => leaderColors.includes(c));
}

// Testo del mazzo: una riga per carta nel formato "4xOP01-013" (quantità, "x", codice, senza spazi).
// Il lettore (parseDecklist) accetta anche le varianti con spazi ("4x OP01-013", "4 OP01-013").
export function deckToText(entries: DeckEntries): string {
  return entriesToCards(entries)
    .map((c) => `${c.qty}x${c.card_code}`)
    .join("\n");
}

export type DeckCheck = { errors: string[]; warnings: string[]; complete: boolean };

// Controllo completo del mazzo. Gli errori impediscono di salvare, gli avvisi no (es. mazzo incompleto).
export function checkDeck(
  entries: DeckEntries,
  catalog: Map<string, CatalogCard>,
  leaderColors: string[],
): DeckCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const total = deckTotal(entries);

  if (total > DECK_SIZE) errors.push(`Il mazzo non può avere più di ${DECK_SIZE} carte (ne ha ${total}).`);
  for (const [code, qty] of Object.entries(entries)) {
    if (qty > MAX_COPIES) errors.push(`${code}: al massimo ${MAX_COPIES} copie.`);
    const card = catalog.get(code);
    if (!card) {
      errors.push(`${code}: carta sconosciuta.`);
      continue;
    }
    if (card.type === "Leader") errors.push(`${code}: un leader non va nel mazzo.`);
    if (!colorsMatch(card.colors, leaderColors)) errors.push(`${code}: il colore non corrisponde al leader.`);
    if (card.colors.length === 0) warnings.push(`${code}: carta senza dati (colore non verificato).`);
  }

  const complete = errors.length === 0 && total === DECK_SIZE;
  if (errors.length === 0 && total < DECK_SIZE) warnings.push(`Mancano ${DECK_SIZE - total} carte per arrivare a ${DECK_SIZE}.`);
  return { errors, warnings, complete };
}
