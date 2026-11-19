// Costruisce l'SQL con le migrazioni che mancano a un progetto Supabase già inizializzato (es. produzione),
// da incollare nell'SQL Editor. Non si connette a nessun database.
//
// Uso:   node scripts/build-prod-delta.mjs [versione1 versione2 …]
// Esito: supabase/prod/delta.sql (file generato, non committato)
//
// - Senza argomenti usa l'elenco predefinito qui sotto (quelle successive al bootstrap di produzione).
// - Ogni migrazione è protetta: se la sua versione è già nel registro del progetto viene saltata, quindi lo
//   stesso file si può rilanciare senza rischi. Per la sola migrazione delle colonne del catalogo c'è anche un
//   controllo sulla colonna, perché potrebbe essere stata applicata a mano senza registrarla.
// - Tutto in una transazione: se una istruzione fallisce non resta niente a metà.
// - Si prende il testo delle migrazioni dai file tracciati da git (le bozze non committate restano fuori).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_VERSIONS = [
  "20261117164624", // cards_catalog_columns
  "20261118093903", // tournament_results_shop_logos (alias, risultati del torneo, logo dei negozi)
  "20261118120500", // matches_bye_no_draw
  "20261118170000", // participation_shop
  "20261118180000", // claim_community_tournaments
  "20261119161337", // shop_bandai_organizer
  "20261119163352", // shop_external_ids
  "20261119190000", // drop_shops_bandai_organizer_id
];
// Se la condizione è vera la migrazione è già applicata a mano: si registra soltanto.
const ALREADY = {
  "20261117164624":
    "exists (select 1 from information_schema.columns where table_schema = 'onepiece' and table_name = 'cards' and column_name = 'image_path')",
  "20261119120000":
    "exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'shop_tournament_players')",
  "20261119161337":
    "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shops' and column_name = 'bandai_organizer_id')",
  "20261119180000":
    "exists (select 1 from information_schema.columns where table_schema = 'onepiece' and table_name = 'matches' and column_name = 'went_first')",
  "20261119163352":
    "exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shop_external_ids')",
  "20261119190000":
    "not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shops' and column_name = 'bandai_organizer_id')",
};

const versions = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_VERSIONS;
const tracked = execFileSync("git", ["ls-files", "supabase/migrations"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\/\d{14}_[a-z0-9_]+\.sql$/.test(f));

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const parts = [
  `-- Migrazioni mancanti (${versions.length}), generate da scripts/build-prod-delta.mjs. Si può rilanciare: salta quelle già registrate.`,
  "begin;",
];

for (const v of versions) {
  const file = tracked.find((f) => path.basename(f).startsWith(`${v}_`));
  if (!file) {
    console.error(`Migrazione ${v} non trovata tra i file tracciati da git.`);
    process.exit(1);
  }
  const base = path.basename(file, ".sql");
  const name = base.slice(15);
  const sql = readFileSync(file, "utf8").trim();
  if (sql.includes("$mig$") || sql.includes("$delta$")) {
    console.error(`${base}: contiene un delimitatore riservato.`);
    process.exit(1);
  }
  const register = `insert into supabase_migrations.schema_migrations (version, name, statements) values (${q(v)}, ${q(name)}, array[${q(`applicata dal delta, vedi supabase/migrations/${base}.sql`)}]);`;
  const body = ALREADY[v]
    ? `    if ${ALREADY[v]} then
      null; -- già applicata a mano: si registra soltanto
    else
      execute $mig$
${sql}
      $mig$;
    end if;`
    : `    execute $mig$
${sql}
    $mig$;`;
  parts.push(`
-- ================= ${base} =================
do $delta$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = ${q(v)}) then
${body}
    ${register}
  end if;
end
$delta$;`);
}
parts.push("\ncommit;");

mkdirSync("supabase/prod", { recursive: true });
const out = "supabase/prod/delta.sql";
writeFileSync(out, parts.join("\n") + "\n");
console.log(`${out}: ${versions.length} migrazioni, ${(Buffer.byteLength(parts.join("\n")) / 1024).toFixed(0)} KB`);
for (const v of versions) console.log(`  ${v}`);
