// Importa il catalogo delle carte One Piece: dati da optcgapi.com e (facoltativo) immagini da una cartella.
//
// Uso (la chiave di servizio si passa solo da riga di comando: non va scritta in nessun file):
//   SUPABASE_URL=https://<progetto>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chiave> \
//     node scripts/import-cards.mjs [--images <cartella>] [--go]
//
// Senza --go è una PROVA: legge e controlla tutto, mostra cosa farebbe e non scrive niente.
// Senza URL e chiave fa una prova "offline": nessun database, solo i dati.
//
// Opzioni:
//   --bandai <serie>     per un set non ancora nell'API: legge le carte dal sito ufficiale Bandai
//                        (numero della serie dal menu di en.onepiece-cardgame.com/cardlist, es. 569118 = OP-18)
//   --set=OP18           limita il lavoro a un set
//   --from <cartella>    usa allSetCards.json e allSTCards.json già scaricati invece di chiamare l'API
//   --images <cartella>  cartella delle immagini (es. OPTCGSim/.../Cards): carica anche le immagini
//   --only=OP01-001,...  limita il lavoro a questi codici (per provare)
//   --force              ricarica anche le immagini già presenti
//   --tcg=onepiece       percorso del gioco nel bucket (default: onepiece)
//
// Dati: per ogni codice si usa la stampa base (una per codice), si scartano le alternative e i prezzi.
// Le carte della cartella che l'API non ha ancora (es. set appena usciti) ricevono una riga con il codice
// come nome provvisorio, che la prossima importazione completa. L'API chiede di non esagerare con le
// chiamate: questo script ne fa DUE per esecuzione (set e starter deck), con una pausa.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { fetchBandaiSet } from "./bandai-cardlist.mjs";

const API = "https://optcgapi.com/api";
const UA = "ohara-tcg-buddy-catalog/0.1 (importazione manuale del catalogo)";
const BUCKET = "card-images";
const CODE = /^[A-Z0-9]+-\d{3}$/;
const FILE = /^([A-Za-z0-9]+-\d{3})\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 524288;
const SIZES = [
  { suffix: ".webp", width: 480, quality: 80 },
  { suffix: ".thumb.webp", width: 160, quality: 72 },
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const go = flag("--go");
const force = flag("--force");
const fromDir = value("--from");
const imagesDir = value("--images");
const tcg = (args.find((a) => a.startsWith("--tcg=")) ?? "--tcg=onepiece").slice(6);
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)) : null;

// --bandai <serie>: legge le carte di quel set dal sito ufficiale Bandai (per i set che l'API non ha ancora);
// i dati ufficiali hanno la precedenza su quelli dell'API per gli stessi codici.
const bandaiSeries = value("--bandai");
const setArg = args.find((a) => a.startsWith("--set="));
const onlySet = setArg ? setArg.slice(6).trim().toUpperCase() : null;
const wanted = (code) => (!only || only.has(code)) && (!onlySet || code.startsWith(`${onlySet}-`));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const offline = !url || !key;

if (!/^[a-z0-9-]{2,30}$/.test(tcg)) {
  console.error("Il nome del gioco (--tcg) può avere solo lettere minuscole, numeri e trattini.");
  process.exit(1);
}
if (go && offline) {
  console.error("Per scrivere servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

console.log(offline ? "Modalità: prova offline (nessun database)" : `Progetto: ${new URL(url).host}`);
console.log(go ? "Modalità: SCRITTURA REALE" : "Modalità: prova (non scrive; aggiungi --go per scrivere)");

// ---------- 1. Dati dall'API ----------

async function load(endpoint) {
  if (fromDir) return JSON.parse(await readFile(path.join(fromDir, `${endpoint}.json`), "utf8"));
  const res = await fetch(`${API}/${endpoint}/`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  return res.json();
}

const rows = [];
for (const endpoint of ["allSetCards", "allSTCards"]) {
  rows.push(...(await load(endpoint)));
  if (!fromDir && endpoint === "allSetCards") await new Promise((r) => setTimeout(r, 3000));
}
console.log(`Righe lette dall'API: ${rows.length}`);

if (bandaiSeries) {
  const official = await fetchBandaiSet(bandaiSeries);
  console.log(`Sito Bandai (serie ${bandaiSeries}): ${official.rows.length} carte${official.setName ? ` · ${official.setName}` : ""}`);
  const officialCodes = new Set(official.rows.map((r) => r.card_set_id));
  const kept = rows.filter((r) => !officialCodes.has(String(r.card_set_id ?? "").toUpperCase().replace(/_[A-Z0-9]+$/i, "")));
  rows.splice(0, rows.length, ...kept, ...official.rows);
}

const toInt = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};
const cleanName = (s) => String(s ?? "").replace(/\s*\((?:\d{3}|[A-Z]{1,4}\d{0,2}-\d{3})\)\s*$/, "").trim();

// Una riga per codice: la stampa base (immagine senza suffisso _p1, _r1…).
const byCode = new Map();
for (const r of rows) {
  const raw = String(r.card_set_id ?? "").toUpperCase();
  const code = raw.replace(/_[A-Z0-9]+$/i, "");
  if (!CODE.test(code)) continue;
  const isBase = String(r.card_image_id ?? "").toUpperCase() === code;
  const prev = byCode.get(code);
  if (!prev || (isBase && !prev.isBase)) byCode.set(code, { r, isBase });
}

const cards = new Map();
for (const [code, { r }] of byCode) {
  if (!wanted(code)) continue;
  const effect = r.card_text ? String(r.card_text).trim().slice(0, 2000) : null;
  const life = toInt(r.life);
  const counter = toInt(r.counter_amount);
  cards.set(code, {
    card_code: code,
    name: cleanName(r.card_name) || code,
    type: r.card_type ? String(r.card_type).trim() : null,
    colors: String(r.card_color ?? "").split(/\s+/).filter(Boolean),
    cost: toInt(r.card_cost),
    power: toInt(r.card_power),
    rarity: r.rarity ? String(r.rarity).trim() : null,
    set_code: code.split("-")[0],
    effect_text: effect,
    life: life !== null && life >= 0 && life <= 20 ? life : null,
    counter: counter !== null && counter >= 0 && counter <= 5000 ? counter : null,
    attribute: r.attribute ? String(r.attribute).trim().slice(0, 40) : null,
    // L'API incolla i tratti con uno spazio ("Straw Hat Crew Supernovas") e non c'è modo affidabile di
    // separarli dai soli dati: si divide solo dove c'è uno slash e il resto si tiene com'è. Il filtro per
    // tratto nell'app è quindi una ricerca di testo, non un'uguaglianza.
    traits: String(r.sub_types ?? "").split("/").map((t) => t.trim()).filter(Boolean),
  });
}

// Nomi dei set: quello più frequente tra le righe con quel prefisso.
const setNames = new Map();
for (const r of rows) {
  const code = String(r.card_set_id ?? "").toUpperCase().split("-")[0];
  if (!code || !r.set_name) continue;
  const m = setNames.get(code) ?? new Map();
  m.set(r.set_name, (m.get(r.set_name) ?? 0) + 1);
  setNames.set(code, m);
}
const setName = (code) => {
  const m = setNames.get(code);
  return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : code;
};

// ---------- 2. Immagini: codici nella cartella ----------

const folder = new Map(); // codice → percorso relativo
if (imagesDir) {
  for (const rel of (await readdir(imagesDir, { recursive: true })).sort()) {
    const m = FILE.exec(path.basename(rel));
    if (!m) continue; // include i "_small" e i file che non sono carte (es. Don)
    const code = m[1].toUpperCase();
    if (!wanted(code)) continue;
    if (!folder.has(code)) folder.set(code, rel);
  }
  console.log(`Immagini trovate nella cartella: ${folder.size}`);
}

// Carte che l'API non ha ancora: riga provvisoria dal codice.
let placeholders = 0;
for (const code of folder.keys()) {
  if (cards.has(code)) continue;
  cards.set(code, {
    card_code: code, name: code, type: null, colors: [], cost: null, power: null, rarity: null,
    set_code: code.split("-")[0], effect_text: null, life: null, counter: null, attribute: null, traits: [],
  });
  placeholders++;
}

const withoutImage = [...cards.keys()].filter((c) => imagesDir && !folder.has(c)).length;
console.log(`Carte da importare: ${cards.size} (di cui ${placeholders} provvisorie, senza dati dall'API)`);
if (imagesDir) console.log(`Carte senza immagine nella cartella: ${withoutImage}`);
const bySet = {};
for (const c of cards.values()) bySet[c.set_code] = (bySet[c.set_code] ?? 0) + 1;
console.log(`Set coinvolti: ${Object.keys(bySet).length}`);
const sample = cards.get("OP01-001") ?? [...cards.values()][0];
console.log("Esempio:", JSON.stringify({ ...sample, effect_text: sample.effect_text?.slice(0, 50) }));

if (offline) {
  console.log("\nProva offline completata: nessun database toccato.");
  process.exit(0);
}

// ---------- 3. Scrittura ----------

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const op = supabase.schema("onepiece");

const { data: existingSets, error: setsErr } = await op.from("sets").select("code, name");
if (setsErr) {
  console.error("Non riesco a leggere i set:", setsErr.message);
  process.exit(1);
}
const knownSets = new Set(existingSets.map((s) => s.code));
const newSets = [...new Set([...cards.values()].map((c) => c.set_code))].filter((c) => !knownSets.has(c));
console.log(`\nSet nuovi da creare: ${newSets.length}${newSets.length ? " (" + newSets.join(" ") + ")" : ""}`);

const { data: leaders, error: leadersErr } = await op.from("leaders").select("card_code, image_path");
if (leadersErr) {
  console.error("Non riesco a leggere i leader:", leadersErr.message);
  process.exit(1);
}
const leaderImage = new Map(leaders.filter((l) => l.image_path).map((l) => [l.card_code, l.image_path]));

// I leader che le carte importate hanno e la tabella dei leader non ancora: si creano (nome e colori dalla carta).
const knownLeaders = new Set(leaders.map((l) => l.card_code));
const newLeaders = [...cards.values()].filter((c) => c.type === "Leader" && !knownLeaders.has(c.card_code));
console.log(`Leader nuovi da creare: ${newLeaders.length}${newLeaders.length ? " (" + newLeaders.map((l) => `${l.card_code} ${l.name}`).join(", ") + ")" : ""}`);

const { data: existingCards, error: cardsErr } = await op.from("cards").select("card_code, image_path");
if (cardsErr) {
  console.error("Non riesco a leggere le carte:", cardsErr.message);
  process.exit(1);
}
const haveImage = new Set(existingCards.filter((c) => c.image_path).map((c) => c.card_code));
console.log(`Carte già nel database: ${existingCards.length} (con immagine: ${haveImage.size})`);

if (!go) {
  console.log("\nProva completata: nessuna scrittura. Aggiungi --go per importare.");
  process.exit(0);
}

if (newSets.length) {
  const { error } = await op.from("sets").insert(newSets.map((code) => ({ code, name: setName(code) })));
  if (error) {
    console.error("Errore creando i set:", error.message);
    process.exit(1);
  }
}

// Nome vero ai set che finora avevano solo il codice (creati da un'importazione provvisoria).
for (const s of existingSets) {
  const proper = setName(s.code);
  if (s.name === s.code && proper !== s.code && [...cards.values()].some((c) => c.set_code === s.code)) {
    const { error } = await op.from("sets").update({ name: proper }).eq("code", s.code);
    if (error) console.error(`Nome del set ${s.code} non aggiornato: ${error.message}`);
  }
}

// Le righe delle carte, a gruppi. Le immagini già collegate non si toccano (si aggiornano più sotto).
const list = [...cards.values()];
for (let i = 0; i < list.length; i += 400) {
  const chunk = list.slice(i, i + 400);
  const { error } = await op.from("cards").upsert(chunk, { onConflict: "card_code" });
  if (error) {
    console.error(`Errore importando le carte (${i}-${i + chunk.length}):`, error.message);
    process.exit(1);
  }
}
console.log(`Carte scritte: ${list.length}`);

if (newLeaders.length) {
  const { error } = await op
    .from("leaders")
    .upsert(newLeaders.map((l) => ({ card_code: l.card_code, name: l.name, colors: l.colors, set_code: l.set_code })), { onConflict: "card_code" });
  if (error) {
    console.error("Errore creando i leader:", error.message);
    process.exit(1);
  }
  console.log(`Leader creati: ${newLeaders.length}`);
}

// ---------- 4. Immagini ----------

let uploaded = 0;
let reused = 0;
let skipped = 0;
let bytesTotal = 0;
const failed = [];

async function processImage(code) {
  // I leader hanno già la loro immagine: si riusa quel percorso invece di caricarla due volte.
  if (leaderImage.has(code)) {
    const { error } = await op.from("cards").update({ image_path: leaderImage.get(code) }).eq("card_code", code);
    if (error) throw new Error(`collegamento: ${error.message}`);
    reused++;
    return;
  }
  if (haveImage.has(code) && !force) {
    skipped++;
    return;
  }
  const input = await readFile(path.join(imagesDir, folder.get(code)));
  const outputs = [];
  for (const s of SIZES) {
    const buf = await sharp(input).rotate().resize({ width: s.width, withoutEnlargement: true }).webp({ quality: s.quality }).toBuffer();
    if (buf.length > MAX_BYTES) throw new Error(`${s.suffix} pesa ${buf.length} byte (limite ${MAX_BYTES})`);
    outputs.push({ name: `${tcg}/cards/${code}${s.suffix}`, buf });
  }
  for (const o of outputs) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(o.name, o.buf, { upsert: true, contentType: "image/webp", cacheControl: "604800" });
    if (error) throw new Error(`caricamento ${o.name}: ${error.message}`);
    bytesTotal += o.buf.length;
  }
  const { error } = await op.from("cards").update({ image_path: `${tcg}/cards/${code}` }).eq("card_code", code);
  if (error) throw new Error(`collegamento: ${error.message}`);
  uploaded++;
}

if (imagesDir) {
  const queue = [...folder.keys()].filter((c) => cards.has(c));
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const code = queue[next++];
      try {
        await processImage(code);
      } catch (e) {
        failed.push(`${code}: ${e instanceof Error ? e.message : String(e)}`);
      }
      const done = uploaded + reused + skipped + failed.length;
      if (done % 100 === 0) console.log(`  … ${done}/${queue.length}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`Immagini: caricate ${uploaded}, riusate dai leader ${reused}, già presenti ${skipped}, ${(bytesTotal / 1048576).toFixed(1)} MB scritti.`);
}

// I leader nuovi usano la stessa immagine della loro carta.
for (const l of newLeaders) {
  const { data } = await op.from("cards").select("image_path").eq("card_code", l.card_code).maybeSingle();
  if (data?.image_path) await op.from("leaders").update({ image_path: data.image_path }).eq("card_code", l.card_code);
}

if (failed.length) {
  console.log(`Errori (${failed.length}):\n  ${failed.slice(0, 30).join("\n  ")}`);
  process.exit(2);
}
console.log("\nFatto.");
