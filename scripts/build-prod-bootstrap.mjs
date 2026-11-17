// Costruisce un unico file SQL con tutte le migrazioni già committate, in ordine, da incollare nell'SQL Editor
// di un progetto Supabase NUOVO (es. produzione). Non si connette a nessun database.
//
// Uso:   node scripts/build-prod-bootstrap.mjs
// Esito: supabase/prod/bootstrap.sql (file generato, non committato)
//
// - Include solo le migrazioni tracciate da git: le bozze e i file non committati restano fuori.
// - Tutto in una transazione: se una istruzione fallisce non resta niente a metà.
// - In fondo registra le versioni nell'elenco delle migrazioni del progetto, così un futuro
//   `supabase db push` non prova a riapplicarle.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const files = execFileSync("git", ["ls-files", "supabase/migrations"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\/\d{14}_[a-z0-9_]+\.sql$/.test(f))
  .sort();

if (files.length === 0) {
  console.error("Nessuna migrazione tracciata da git in supabase/migrations.");
  process.exit(1);
}

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;

const parts = [];
parts.push(`-- Inizializzazione di un progetto Supabase nuovo: ${files.length} migrazioni, generate da scripts/build-prod-bootstrap.mjs.`);
parts.push("-- Prima di lanciarlo: in Settings → API aggiungi lo schema `onepiece` agli Exposed schemas.");
parts.push("begin;");

const registered = [];
for (const f of files) {
  const base = path.basename(f, ".sql");
  const version = base.slice(0, 14);
  const name = base.slice(15);
  registered.push({ version, name, file: path.basename(f) });
  parts.push(`\n-- ================= ${base} =================\n${readFileSync(f, "utf8").trim()}\n`);
}

parts.push("-- ================= registro delle migrazioni =================");
parts.push("create schema if not exists supabase_migrations;");
parts.push(`create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);`);
for (const r of registered) {
  parts.push(
    `insert into supabase_migrations.schema_migrations (version, name, statements) values (${sqlString(r.version)}, ${sqlString(r.name)}, array[${sqlString(`bootstrap iniziale, vedi supabase/migrations/${r.file}`)}]) on conflict (version) do nothing;`,
  );
}
parts.push("\ncommit;");

mkdirSync("supabase/prod", { recursive: true });
const out = "supabase/prod/bootstrap.sql";
writeFileSync(out, parts.join("\n") + "\n");
console.log(`${out}: ${files.length} migrazioni, ${(Buffer.byteLength(parts.join("\n")) / 1024).toFixed(0)} KB`);
for (const r of registered) console.log(`  ${r.version} ${r.name}`);
