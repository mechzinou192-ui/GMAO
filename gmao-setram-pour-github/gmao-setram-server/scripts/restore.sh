#!/usr/bin/env bash
# Restauration :  ./scripts/restore.sh /var/backups/gmao/gmao_2026-10-01_0200.sql.gz [/var/backups/gmao/gmao_files_2026-10-01_0200.tar.gz]
# Le 2e argument (pièces jointes) est facultatif ; sans lui, les photos actuelles sont conservées.
set -euo pipefail
[ $# -ge 1 ] && [ $# -le 2 ] || { echo "Usage : $0 fichier.sql.gz [fichier_photos.tar.gz]"; exit 1; }
cd "$(dirname "$0")/.."
read -rp "Ceci REMPLACE toutes les données actuelles. Continuer ? (oui/non) " a
[ "$a" = "oui" ] || exit 1
docker compose stop app
gunzip -c "$1" | docker compose exec -T db psql -U gmao -d gmao
if [ $# -eq 2 ]; then
  docker compose run --rm -T --no-deps -u root --entrypoint sh app -c 'rm -rf /data/files && mkdir -p /data && tar -C /data -xzf - && chown -R node:node /data' < "$2"
fi
docker compose start app
