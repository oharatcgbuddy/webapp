// Lettura dei link e dei codici mazzo di OPlay (oplaytcg.com/deck-builder?d=…).
//
// Il parametro "d" è un codice autonomo (non serve il loro catalogo): un carattere di versione, i dati
// e un carattere di controllo. Si leggono due versioni:
//  - "2": bit impacchettati, 6 bit per carattere (alfabeto base64url). Primo bit = c'è il leader; poi la
//         carta del leader, il numero di carte (7 bit) e per ogni carta: "stesso set della precedente" (1 bit),
//         se no famiglia (4 bit: OP, ST, EB, PRB, P; 14 = lettere libere, 15 = testo libero) e set (7 bit);
//         poi numero (10 bit) e copie meno uno (2 bit).
//  - "1": base64url di un testo "LEADER|4xOP01-013,3xOP01-016,…".
// Il controllo è un semplice hash sui caratteri dei dati. Qualunque anomalia restituisce null: nessuna eccezione.

export type OplayDeck = { leaderCode: string | null; entries: { code: string; qty: number }[] };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const FAMILIES = ["OP", "ST", "EB", "PRB", "P"];
const CODE = /^[A-Z]{1,4}\d{0,2}-\d{3}$/;
const MAX_ENTRIES = 80;

type Parts = { prefix: string; set: number };

function checksum(data: string): string {
  let t = 7;
  for (let i = 0; i < data.length; i++) t = (31 * t + data.charCodeAt(i)) % 4093;
  return ALPHABET[t % 64];
}

function readCard(next: (n: number) => number, withQty: boolean, prev: Parts | null) {
  let prefix: string;
  let set: number;
  if (withQty && next(1) === 1) {
    if (!prev) throw new Error("set precedente mancante");
    prefix = prev.prefix;
    set = prev.set;
  } else {
    const family = next(4);
    if (family === 15) {
      // testo libero: lunghezza (5 bit) e caratteri (7 bit); le copie sono su 7 bit
      const len = next(5) + 1;
      let code = "";
      for (let i = 0; i < len; i++) code += String.fromCharCode(next(7));
      return { code, qty: withQty ? next(7) : 1, parts: null as Parts | null };
    }
    if (family === 14) {
      const len = next(2) + 1;
      prefix = "";
      for (let i = 0; i < len; i++) {
        const letter = next(5);
        if (letter > 25) throw new Error("lettera fuori intervallo");
        prefix += String.fromCharCode(65 + letter);
      }
    } else {
      if (family >= FAMILIES.length) throw new Error("famiglia sconosciuta");
      prefix = FAMILIES[family];
    }
    set = next(7);
  }
  const num = next(10);
  const code = `${prefix}${set ? String(set).padStart(2, "0") : ""}-${String(num).padStart(3, "0")}`;
  return { code, qty: withQty ? next(2) + 1 : 1, parts: { prefix, set } as Parts | null };
}

function decodeV2(body: string): OplayDeck | null {
  const data = body.slice(1, -1);
  if (!data || checksum(data) !== body[body.length - 1]) return null;

  const bits: number[] = [];
  for (const ch of data) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    for (let b = 5; b >= 0; b--) bits.push((v >> b) & 1);
  }
  let pos = 0;
  const next = (n: number) => {
    if (pos + n > bits.length) throw new Error("fine del codice");
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | bits[pos++];
    return v;
  };

  try {
    let leaderCode: string | null = null;
    let prev: Parts | null = null;
    if (next(1) === 1) {
      const l = readCard(next, false, null);
      leaderCode = l.code;
      prev = l.parts;
    }
    const count = next(7);
    if (count > MAX_ENTRIES) return null;
    const entries: { code: string; qty: number }[] = [];
    for (let i = 0; i < count; i++) {
      const c = readCard(next, true, prev);
      prev = c.parts;
      if (!CODE.test(c.code) || c.qty <= 0) return null;
      entries.push({ code: c.code, qty: c.qty });
    }
    if (leaderCode && !CODE.test(leaderCode)) return null;
    if (!leaderCode && entries.length === 0) return null;
    return { leaderCode, entries };
  } catch {
    return null;
  }
}

function decodeV1(body: string): OplayDeck | null {
  let text: string;
  try {
    text = atob(body.slice(1).replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const bar = text.indexOf("|");
  if (bar < 0) return null;
  const leader = text.slice(0, bar).toUpperCase();
  const entries: { code: string; qty: number }[] = [];
  for (const part of text.slice(bar + 1).split(",")) {
    const m = /^(\d{1,2})x([A-Za-z0-9-]+)$/i.exec(part);
    if (!m) continue;
    const qty = Number(m[1]);
    const code = m[2].toUpperCase();
    if (qty > 0 && CODE.test(code)) entries.push({ code, qty });
    if (entries.length >= MAX_ENTRIES) break;
  }
  const leaderCode = CODE.test(leader) ? leader : null;
  return leaderCode || entries.length ? { leaderCode, entries } : null;
}

// Accetta il link intero (…/deck-builder?d=CODICE&s=…), il solo parametro o il codice. Null se non è un codice OPlay.
export function decodeOplay(input: string): OplayDeck | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const m = /[?&]d=([A-Za-z0-9_-]+)/.exec(text);
  const body = m ? m[1] : text;
  if (body.length < 3 || !/^[A-Za-z0-9_-]+$/.test(body)) return null;
  if (body[0] === "2") return decodeV2(body);
  if (body[0] === "1") return decodeV1(body);
  return null;
}
