#!/usr/bin/env bash
# Nightly Postgres backup: pg_dump from the running db container -> gzip file,
# keeping the last N days. Installed to /usr/local/bin by provision.sh and run
# from cron. Restore with:
#   gunzip -c FILE.sql.gz | docker compose exec -T db psql -U jobsearch jobsearch
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/root/JobSearchPlatform}"   # set by the cron entry
BACKUP_DIR="${BACKUP_DIR:-/opt/jobsearch-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

# Read the db user/name from .env (fall back to the compose defaults).
DB_USER="jobsearch"
DB_NAME="jobsearch"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/jobsearch-$STAMP.sql.gz"

echo "[$(date -Is)] dumping $DB_NAME -> $OUT"
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
	pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

# Prune old dumps.
find "$BACKUP_DIR" -name 'jobsearch-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "[$(date -Is)] done. current backups:"
ls -lh "$BACKUP_DIR" | tail -n +1
