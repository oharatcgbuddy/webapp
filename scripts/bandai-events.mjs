// Scarica da BANDAI TCG+ gli eventi di alcuni negozi precisi e li salva in un JSON (per guardarli o confrontarli).
// Da lanciare A MANO dal proprio PC. Per importarli nel database si usa invece scripts/sync-bandai-events.mjs.
//
// Requisiti (una volta):  npm i --no-save playwright-core     (serve Google Chrome installato)
//
// Uso:
//   node scripts/bandai-events.mjs --organizer 5823 [--organizer …] [--from 2026-12-01] [--to 2027-03-31] [--out eventi.json]
//   node scripts/bandai-events.mjs --keyword "Nome Negozio"          (ricerca testuale, meno precisa)
//
// Al primo avvio si apre Chrome: fai il login, scegli One Piece come gioco e apri l'elenco eventi, poi torna
// nel terminale e premi Invio. Gli avvii successivi riusano il profilo.
// Una richiesta ogni ~2 secondi. Controlla tu i Termini d'uso di BANDAI TCG+ prima di usarlo.

import fs from "node:fs";
import { DELAY_MS, fetchEvents, openBandai, sleep } from "./bandai-events-lib.mjs";

function parseArgs(argv) {
  const o = { organizers: [], keywords: [], from: null, to: null, out: "bandai-eventi.json", game: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--organizer") o.organizers.push(v());
    else if (a === "--keyword") o.keywords.push(v());
    else if (a === "--from") o.from = v();
    else if (a === "--to") o.to = v();
    else if (a === "--out") o.out = v();
    else if (a === "--game") o.game = v();
    else throw new Error(`Argomento sconosciuto: ${a}`);
  }
  if (!o.organizers.length && !o.keywords.length) throw new Error("Indica almeno un --organizer <id> o un --keyword <testo>.");
  for (const id of o.organizers) if (!/^\d{1,12}$/.test(id ?? "")) throw new Error(`organizer non valido: ${id}`);
  for (const d of [o.from, o.to]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Le date vanno scritte AAAA-MM-GG.");
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const session = await openBandai({ game: args.game });
  try {
    const byId = new Map();
    const targets = [
      ...args.organizers.map((id) => ({ label: `organizzatore ${id}`, extra: { organizer_id: id } })),
      ...args.keywords.map((k) => ({ label: `ricerca "${k}"`, extra: { keyword: k } })),
    ];
    for (const t of targets) {
      const { total, events } = await fetchEvents(session, t.extra, {
        from: args.from,
        to: args.to,
        onPage: (p, rows, tot) => console.log(`  pagina ${p}: ${rows} righe (total=${tot})`),
      });
      for (const e of events) byId.set(e.external_id, e);
      console.log(`${t.label}: ${total} eventi trovati`);
      await sleep(DELAY_MS);
    }
    const events = [...byId.values()].sort((a, b) => String(a.starts_at_local).localeCompare(String(b.starts_at_local)));
    fs.writeFileSync(args.out, JSON.stringify({ scraped_at: new Date().toISOString(), count: events.length, events }, null, 2));
    console.log(`\nSalvati ${events.length} eventi in ${args.out}`);
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error(`\nErrore: ${err.message}`);
  process.exit(1);
});
