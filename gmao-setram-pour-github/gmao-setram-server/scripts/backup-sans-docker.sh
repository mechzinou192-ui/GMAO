#!/usr/bin/env bash
# Sauvegarde pour une installation SANS Docker : base PostgreSQL + photos, avec le même horodatage.
#   ./scripts/backup-sans-docker.sh                       (lit /etc/gmao-setram/gmao.env)
#   0 2 * * * /opt/gmao-setram/scripts/backup-sans-docker.sh      (cron quotidien, utilisateur gmao)
# Restauration :  createdb gmao_restaure && gunzip -c gmao_AAAA-MM-JJ_HHMM.sql.gz | psql gmao_restaure
#                 tar -C /var/lib/gmao-setram -xzf gmao_files_AAAA-MM-JJ_HHMM.tar.gz
set -euo pipefail
ENV_FILE="${GMAO_ENV:-/etc/gmao-setram/gmao.env}"
[ -r "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
: "${DATABASE_URL:?DATABASE_URL introuvable (définir GMAO_ENV ou exporter DATABASE_URL)}"
DEST="${BACKUP_DIR:-/var/backups/gmao}"; KEEP_DAYS="${KEEP_DAYS:-30}"
FILES_DIR="${FILES_DIR:-/var/lib/gmao-setram/files}"
mkdir -p "$DEST"; umask 077
STAMP=$(date +%F_%H%M)
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$DEST/gmao_$STAMP.sql.gz"
if [ -d "$FILES_DIR" ]; then tar -C "$(dirname "$FILES_DIR")" -czf "$DEST/gmao_files_$STAMP.tar.gz" "$(basename "$FILES_DIR")"; fi
find "$DEST" \( -name 'gmao_*.sql.gz' -o -name 'gmao_files_*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "Sauvegarde créée : $DEST/gmao_$STAMP.sql.gz ($(du -h "$DEST/gmao_$STAMP.sql.gz" | cut -f1))"
