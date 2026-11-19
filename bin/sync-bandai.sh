#!/usr/bin/env bash
# Sincronizza i tornei di BANDAI TCG+ dei locali nel database di dev o di prod.
# Legge URL e chiave di servizio da .env.dev o .env.prod (file ignorati da git, vedi .env.example).
#
# Uso:
#   bin/sync-bandai.sh dev                 prova su dev (non scrive niente)
#   bin/sync-bandai.sh dev --go            scrive su dev
#   bin/sync-bandai.sh prod                prova su prod
#   bin/sync-bandai.sh prod --go           scrive su prod (chiede conferma)
#
# Qualunque altro argomento passa a scripts/sync-bandai-events.mjs, per esempio:
#   bin/sync-bandai.sh prod --link <slug>=<ID> --add <ID> --only <ID> --from 2026-12-01
# I collegamenti (--link / --add) bastano una volta: poi sono nel database e basta il comando senza argomenti.

set -euo pipefail

cd "$(dirname "$0")/.."

env_name="${1:-}"
case "$env_name" in
  dev | prod) shift ;;
  *)
    echo "Uso: bin/sync-bandai.sh dev|prod [--go] [altri argomenti dello script]" >&2
    exit 2
    ;;
esac

env_file=".env.$env_name"
if [ ! -f "$env_file" ]; then
  echo "Manca $env_file (copia i nomi da .env.example e inserisci URL e chiave)." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "./$env_file"
set +a

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "$env_file: servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (la chiave è ancora vuota?)." >&2
  exit 1
fi

# Con --go su prod si chiede conferma scrivendo "prod".
go=false
for a in "$@"; do [ "$a" = "--go" ] && go=true; done
if [ "$env_name" = "prod" ] && [ "$go" = true ]; then
  host="${SUPABASE_URL#https://}"
  printf 'Stai per SCRIVERE sul database di PRODUZIONE (%s).\nScrivi "prod" per continuare: ' "${host%%/*}"
  read -r answer
  [ "$answer" = "prod" ] || { echo "Annullato."; exit 1; }
fi

echo "Ambiente: $env_name"
exec node scripts/sync-bandai-events.mjs "$@"
