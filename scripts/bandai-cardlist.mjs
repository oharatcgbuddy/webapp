// Legge dal sito ufficiale Bandai (en.onepiece-cardgame.com/cardlist) le carte di un set e le restituisce
// nello stesso formato delle righe di optcgapi.com, così lo script di importazione le tratta allo stesso modo.
// Serve per i set appena usciti, che l'API della comunità non ha ancora. Una sola richiesta, una pagina pubblica.
//
// Il numero della serie si trova nel menu "Series" della pagina (es. 569118 = OP-18).

const BASE = "https://en.onepiece-cardgame.com/cardlist/";
const UA = "ohara-tcg-buddy-catalog/0.1 (importazione manuale del catalogo)";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

// Testo di un blocco HTML: i <br> diventano a capo, i tag spariscono.
const text = (html) =>
  decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();

// Contenuto di <div class="<cls>"><h3>…</h3>CONTENUTO</div>
function field(block, cls) {
  const m = new RegExp(`<div class="${cls}">\\s*<h3>[\\s\\S]*?</h3>([\\s\\S]*?)</div>`).exec(block);
  return m ? text(m[1]) : "";
}

const number = (s) => (/^\d+$/.test(s) ? Number(s) : null);
const TYPES = { LEADER: "Leader", CHARACTER: "Character", EVENT: "Event", STAGE: "Stage" };
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export async function fetchBandaiSet(series) {
  if (!/^\d{4,8}$/.test(String(series))) throw new Error("Numero di serie non valido.");
  const res = await fetch(`${BASE}?series=${series}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Sito Bandai: HTTP ${res.status}`);
  const html = await res.text();

  // Nome del set dal menu (es. "BOOSTER PACK <br> -THE DOMINANCE OF GOD- [OP-18]").
  const opt = new RegExp(`<option value="${series}"[^>]*>([\\s\\S]*?)</option>`).exec(html);
  const label = opt ? text(decode(opt[1])) : "";
  const named = /-\s*([^-\]]+?)\s*-/.exec(label);
  const setName = named ? titleCase(named[1].trim()) : null;

  const rows = [];
  const re = /<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g;
  for (let m; (m = re.exec(html)); ) {
    const [, id, block] = m;
    const info = [...(/<div class="infoCol">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? "").matchAll(/<span>([^<]*)<\/span>/g)].map((x) => text(x[1]));
    const [code, rarity, type] = info;
    if (!code || id !== code) continue; // le versioni alternative hanno un id diverso: si usa solo la stampa base
    const name = text(/<div class="cardName">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? "");
    const costBlock = /<div class="cost"><h3>([^<]*)<\/h3>([\s\S]*?)<\/div>/.exec(block);
    const costLabel = costBlock ? text(costBlock[1]).toLowerCase() : "";
    const costValue = costBlock ? number(text(costBlock[2])) : null;
    const attribute = /<div class="attribute">[\s\S]*?<i>([^<]*)<\/i>/.exec(block)?.[1];
    const kind = TYPES[(type ?? "").toUpperCase()] ?? null;
    // Come nei dati già presenti: costo 0 quando la fonte scrive "-", counter 0 per i personaggi senza counter.
    const counter = number(field(block, "counter")) ?? (kind === "Character" ? 0 : null);

    rows.push({
      card_set_id: code,
      card_image_id: code,
      card_name: name,
      card_text: field(block, "text") || null,
      card_type: kind ?? (type ? titleCase(type) : null),
      // L'API scrive i colori separati da spazio: "Red/Blue" → "Red Blue".
      card_color: field(block, "color").split("/").map((c) => c.trim()).filter(Boolean).join(" "),
      card_cost: costLabel === "life" ? null : (costValue ?? 0),
      life: costLabel === "life" ? costValue : null,
      card_power: number(field(block, "power")),
      counter_amount: counter,
      attribute: attribute ? text(attribute) : null,
      sub_types: field(block, "feature") || null, // già separati da "/"
      rarity: rarity || null,
      set_name: setName,
    });
  }
  return { setName, rows };
}
