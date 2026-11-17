// Carica le immagini dei leader: le ridimensiona in due WebP (160 e 480 px), le carica nel bucket
// "card-images" di Supabase Storage e collega ogni leader al suo percorso.
//
// Uso (la chiave di servizio si passa solo da riga di comando: non va scritta in nessun file):
//   SUPABASE_URL=https://<progetto>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chiave> \
//     npm run images:leaders -- <cartella> [--go]
//
// I file si chiamano come il codice del leader (OP01-001.png, ST01-001.jpg…) e possono stare anche
// in sottocartelle (una per set): si legge tutto l'albero. I file "_small" si ignorano (le miniature
// le genera lo script) e si caricano solo i codici che esistono tra i leader.
//
// Opzioni:
//   --go                 carica davvero. Senza, è una PROVA: mostra cosa farebbe e quanto pesa.
//   --only=OP01-001,...  limita il lavoro a questi codici (utile per provare con una sola carta).
//   --tcg=onepiece       gioco a cui appartengono le immagini (default: onepiece). Nel bucket i file
//                        stanno sotto il percorso del gioco: onepiece/leaders/OP01-001.webp, così
//                        un domani un altro TCG non si mescola con questo.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "card-images";
const FILE = /^([A-Z0-9]+-\d{3})\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 524288; // limite del bucket
const SIZES = [
  { suffix: ".webp", width: 480, quality: 80 },
  { suffix: ".thumb.webp", width: 160, quality: 72 },
];

const args = process.argv.slice(2);
const go = args.includes("--go");
const dir = args.find((a) => !a.startsWith("--"));
const onlyArg = args.find((a) => a.startsWith("--only="));
const tcgArg = args.find((a) => a.startsWith("--tcg="));
const tcg = tcgArg ? tcgArg.slice(6) : "onepiece";
if (!/^[a-z0-9-]{2,30}$/.test(tcg)) {
  console.error("Il nome del gioco (--tcg) può avere solo lettere minuscole, numeri e trattini.");
  process.exit(1);
}
const only = onlyArg ? new Set(onlyArg.slice(7).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)) : null;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dir || !url || !key) {
  console.error("Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run images:leaders -- <cartella> [--go]");
  process.exit(1);
}

console.log(`Progetto: ${new URL(url).host}`);
console.log(`Gioco: ${tcg} (percorso nel bucket: ${tcg}/leaders/…)`);
console.log(go ? "Modalità: CARICAMENTO REALE" : "Modalità: prova (nessun caricamento; aggiungi --go per caricare)");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: leaders, error: leadersError } = await supabase.schema("onepiece").from("leaders").select("card_code");
if (leadersError) {
  console.error("Non riesco a leggere i leader:", leadersError.message);
  process.exit(1);
}
const known = new Set(leaders.map((l) => l.card_code));

// Albero completo; per ogni codice si tiene un solo file (il primo in ordine alfabetico).
const byCode = new Map();
for (const rel of (await readdir(dir, { recursive: true })).sort()) {
  const m = FILE.exec(path.basename(rel));
  if (!m) continue; // include i "_small" e i file che non sono carte (es. Don)
  const code = m[1].toUpperCase();
  if (only && !only.has(code)) continue;
  if (!byCode.has(code)) byCode.set(code, rel);
}
const files = [...byCode.values()];
if (files.length === 0) {
  console.error(`Nessun file con nome tipo OP01-001.png in ${dir}`);
  process.exit(1);
}

let total = 0;
let done = 0;
let notLeaders = 0;
const failed = [];

for (const file of files) {
  const code = FILE.exec(path.basename(file))[1].toUpperCase();
  // Le carte che non sono leader (la maggior parte della cartella) si ignorano in silenzio.
  if (!known.has(code)) {
    notLeaders++;
    continue;
  }

  try {
    const input = await readFile(path.join(dir, file));
    const outputs = [];
    for (const s of SIZES) {
      const buf = await sharp(input)
        .rotate()
        .resize({ width: s.width, withoutEnlargement: true })
        .webp({ quality: s.quality })
        .toBuffer();
      if (buf.length > MAX_BYTES) throw new Error(`${s.suffix} pesa ${buf.length} byte (limite ${MAX_BYTES})`);
      outputs.push({ name: `${tcg}/leaders/${code}${s.suffix}`, buf });
    }
    const bytes = outputs.reduce((n, o) => n + o.buf.length, 0);
    total += bytes;

    if (go) {
      for (const o of outputs) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(o.name, o.buf, { upsert: true, contentType: "image/webp", cacheControl: "604800" });
        if (error) throw new Error(`caricamento ${o.name}: ${error.message}`);
      }
      const { error } = await supabase
        .schema("onepiece")
        .from("leaders")
        .update({ image_path: `${tcg}/leaders/${code}` })
        .eq("card_code", code);
      if (error) throw new Error(`collegamento leader: ${error.message}`);
    }

    done++;
    console.log(`${go ? "ok  " : "prova"} ${code}  ${(bytes / 1024).toFixed(0)} KB`);
  } catch (e) {
    failed.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`\n${go ? "Caricati" : "Da caricare"}: ${done} leader, ${(total / 1024 / 1024).toFixed(2)} MB in totale.`);
console.log(`Carte della cartella che non sono leader (ignorate): ${notLeaders}.`);
const missing = [...known].filter((c) => !byCode.has(c) && (!only || only.has(c)));
if (missing.length) console.log(`Leader senza immagine nella cartella (${missing.length}): ${missing.join(" ")}`);
if (failed.length) {
  console.log(`Errori (${failed.length}):\n  ${failed.join("\n  ")}`);
  process.exit(2);
}
