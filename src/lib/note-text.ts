// Pulizia e controllo delle note brevi scritte dagli utenti (es. nota di un round).
//
// Cosa protegge e cosa no:
// - SQL / filtri: non si fa mai concatenazione. Le scritture passano da supabase-js (valori legati come
//   parametri), quindi un testo come "'; drop table x; --" resta solo testo. Qui non si cerca di
//   "riconoscere" SQL: sarebbe inutile e bloccherebbe testi legittimi.
// - Caratteri invisibili e di controllo (anche bidi), tag HTML e link: rimossi o rifiutati.
// - Parolacce: filtro "best effort" (non può essere perfetto). Si lavora sul testo normalizzato
//   (maiuscole, accenti, numeri al posto di lettere, lettere ripetute o staccate) e si accettano solo
//   lettere latine, per evitare i caratteri "gemelli" di altri alfabeti.
// La lista è in fondo al file: per aggiungere una parola basta una riga.

export const NOTE_MAX = 140;

export type CleanNote = { value: string | null } | { error: string };

// Caratteri invisibili/di formattazione che non servono in una nota: si eliminano.
const ZERO_WIDTH = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Controlli (a capo e tab compresi) diventano spazi.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;
const HTML_TAG = /<\s*[/!?a-z]/i;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|it|net|org|io|me|ly|gg|xyz|co|eu|info|app|dev|tv)\b)/i;

export function cleanNote(raw: string, max = NOTE_MAX): CleanNote {
  const s = raw
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (s === "") return { value: null };
  if ([...s].length > max) return { error: `La nota può avere al massimo ${max} caratteri.` };
  if (NON_LATIN_LETTER.test(s)) return { error: "Nella nota usa solo lettere latine, numeri ed emoji." };
  if (HTML_TAG.test(s)) return { error: "Nella nota non sono ammessi tag HTML." };
  if (LINK.test(s)) return { error: "Nella nota non sono ammessi link." };
  if (hasProfanity(s)) return { error: "La nota contiene parole non ammesse." };
  return { value: s };
}

// ---------- Parolacce ----------

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "€": "e",
};
// "!" e "|" possono essere una "i" ("str0nz!") oppure punteggiatura ("stronzo!"): si provano tutte e due.
const LEET_PUNCT: Record<string, string> = { "!": "i", "|": "i" };

// minuscolo, senza accenti, numeri/simboli → lettere.
function fold(s: string, punctAsLetters: boolean): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[013457@$€]/g, (c) => LEET[c] ?? c);
  return punctAsLetters ? base.replace(/[!|]/g, (c) => LEET_PUNCT[c] ?? c) : base;
}

// Una lettera ripetuta vale una sola ("caaazzo" → "cazo").
const collapse = (t: string) => t.replace(/(.)\1+/g, "$1");

// "c a z z o" → "cazzo": si uniscono le lettere isolate consecutive.
function tokenize(folded: string): string[] {
  const raw = folded.split(/[^a-z]+/).filter(Boolean);
  const out: string[] = [];
  let run = "";
  for (const t of raw) {
    if (t.length === 1) {
      run += t;
      continue;
    }
    if (run) out.push(run);
    run = "";
    out.push(t);
  }
  if (run) out.push(run);
  return out;
}

// Parole intere (si confrontano con le parole del testo, anche con lettere ripetute).
const WORDS = [
  // italiano
  "cazzo", "cazzi", "cazzata", "merda", "merde", "troia", "troie", "culo", "figa", "puttana", "puttane",
  "minchia", "mignotta", "stronzo", "stronza", "stronzi", "coglione", "coglioni", "vaffanculo", "fanculo",
  "bastardo", "bastarda", "zoccola", "frocio", "froci", "ricchione", "culattone", "negro", "negri", "negra",
  "mongoloide", "cornuto", "cretino",
  // inglese
  "fuck", "fucker", "fucking", "fuk", "shit", "bitch", "asshole", "cunt", "dick", "whore", "slut", "retard",
  "retarded", "faggot", "fag",
];

// Insulti che con le lettere ripetute collasserebbero in una parola normale ("nigger" → "niger"):
// si confrontano solo così come sono scritti.
const EXACT = ["nigger", "niggers", "nigga", "niggas"];

// Espressioni lunghe: si cercano anche dentro il testo senza spazi né punteggiatura
// ("porco dio", "p.o.r.c.o.d.i.o"). Solo termini lunghi, per non bloccare parole normali.
const LONG = [
  "porcodio", "diocane", "diomaiale", "dioporco", "porcamadonna", "madonnaputtana", "madonnatroia",
  "vaffanculo", "stronzo", "stronza", "coglione", "bastardo", "puttana", "mignotta", "zoccola", "ricchione",
  "culattone", "mongoloide", "pezzodimerda", "motherfucker", "sonofabitch",
];

const WORD_SET = new Set(WORDS.map(collapse));
const LONG_COLLAPSED = LONG.map(collapse);

function matches(folded: string): boolean {
  const tokens = tokenize(folded);
  if (tokens.some((t) => EXACT.includes(t))) return true;
  if (tokens.some((t) => WORD_SET.has(collapse(t)))) return true;
  const squashed = collapse(tokens.join(""));
  return LONG_COLLAPSED.some((w) => squashed.includes(w));
}

function hasProfanity(s: string): boolean {
  return matches(fold(s, false)) || matches(fold(s, true));
}
