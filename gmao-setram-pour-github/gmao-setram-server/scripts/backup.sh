#!/usr/bin/env bash
# Sauvegarde quotidienne de la base GMAO (conserve 30 jours).
# Cron (root) :  0 2 * * *  /opt/gmao-setram-server/scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-/var/backups/gmao}"
mkdir -p "$DEST"
FILE="$DEST/gmao_$(date +%F_%H%M).sql.gz"
docker compose exec -T db pg_dump -U gmao -d gmao --clean --if-exists | gzip > "$FILE"
# Pièces jointes (photos) : archive du volume, même horodatage que la base
FILES="$DEST/gmao_files_$(date +%F_%H%M).tar.gz"
docker compose exec -T app tar -C /data -czf - files > "$FILES"
find "$DEST" \( -name 'gmao_*.sql.gz' -o -name 'gmao_files_*.tar.gz' \) -mtime +30 -delete
echo "Sauvegarde créée : $FILE ($(du -h "$FILE" | cut -f1)) + $FILES ($(du -h "$FILES" | cut -f1))"
