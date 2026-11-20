#!/usr/bin/env bash
# Sincronizza i tornei di BANDAI TCG+ dei locali nel database di dev o di prod.
# Legge URL e chiave di servizio da .env.dev o .env.prod (file ignorati da git, vedi .env.example).
#
# Uso:
#   bin/sync-bandai.sh dev --all           prova su dev di tutti i locali collegati (non scrive niente)
#   bin/sync-bandai.sh dev --all --go      scrive su dev
#   bin/sync-bandai.sh prod --all          prova su prod
#   bin/sync-bandai.sh prod --all --go     scrive su prod (chiede conferma)
#
# Senza --all si sincronizzano solo i locali indicati; qualunque argomento passa a scripts/sync-bandai-events.mjs:
#   bin/sync-bandai.sh prod --add <ID>               aggiunge un locale nuovo
#   bin/sync-bandai.sh prod --only <ID> --from 2026-12-01   risincronizza un solo locale già collegato
#   bin/sync-bandai.sh prod --link <slug>=<ID>
# I collegamenti (--link / --add) bastano una volta: poi sono nel database e basta --all.

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
