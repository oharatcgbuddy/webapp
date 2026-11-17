// Carica le immagini dei leader: le ridimensiona in due WebP (160 e 480 px), le carica nel bucket
// "card-images" di Supabase Storage e collega ogni leader al suo percorso.
//
// Uso (la chiave di servizio si passa solo da riga di comando: non va scritta in nessun file):
//   SUPABASE_URL=https://<progetto>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chiave> \
//     npm run images:leaders -- <cartella> [--go]
//
// I file della cartella si chiamano come il codice del leader: OP01-001.png, ST01-001.jpg…
// Senza --go è una PROVA: mostra cosa farebbe e quanto pesa, senza caricare nulla.

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
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dir || !url || !key) {
  console.error("Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run images:leaders -- <cartella> [--go]");
  process.exit(1);
}

console.log(`Progetto: ${new URL(url).host}`);
console.log(go ? "Modalità: CARICAMENTO REALE" : "Modalità: prova (nessun caricamento; aggiungi --go per caricare)");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: leaders, error: leadersError } = await supabase.schema("onepiece").from("leaders").select("card_code");
if (leadersError) {
  console.error("Non riesco a leggere i leader:", leadersError.message);
  process.exit(1);
}
const known = new Set(leaders.map((l) => l.card_code));

const files = (await readdir(dir)).filter((f) => FILE.test(f)).sort();
if (files.length === 0) {
  console.error(`Nessun file con nome tipo OP01-001.png in ${dir}`);
  process.exit(1);
}

let total = 0;
let done = 0;
const skipped = [];
const failed = [];

for (const file of files) {
  const code = FILE.exec(file)[1].toUpperCase();
  if (!known.has(code)) {
    skipped.push(`${file} (codice sconosciuto)`);
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
      outputs.push({ name: `leaders/${code}${s.suffix}`, buf });
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
        .update({ image_path: `leaders/${code}` })
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
if (skipped.length) console.log(`Saltati (${skipped.length}):\n  ${skipped.join("\n  ")}`);
if (failed.length) {
  console.log(`Errori (${failed.length}):\n  ${failed.join("\n  ")}`);
  process.exit(2);
}
