#!/bin/bash
# Backs up the tripreviewall PostgreSQL database.
# Meant to run unattended via cron — see scripts/README.md for setup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
  # Only pull DATABASE_URL out of .env — don't blindly export the whole file.
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | cut -d '=' -f2-)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[$(date)] ERROR: DATABASE_URL not set (checked $ENV_FILE and the environment)." >&2
  exit 1
fi

BACKUP_DIR="${TRIPREVIEWALL_BACKUP_DIR:-$HOME/tripreviewall-backups}"
RETENTION_DAYS="${TRIPREVIEWALL_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_FILE="$BACKUP_DIR/tripreviewall-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup to $BACKUP_FILE ..."

if pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"; then
  SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
  echo "[$(date)] Backup succeeded: $BACKUP_FILE ($SIZE)"
else
  echo "[$(date)] Backup FAILED — removing partial file." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Retention: delete backups older than N days so the disk doesn't fill up.
DELETED_COUNT="$(find "$BACKUP_DIR" -name 'tripreviewall-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
if [ "$DELETED_COUNT" -gt 0 ]; then
  echo "[$(date)] Cleaned up $DELETED_COUNT backup(s) older than $RETENTION_DAYS days."
fi

echo "[$(date)] Done. $(find "$BACKUP_DIR" -name 'tripreviewall-*.sql.gz' | wc -l) backup(s) currently on disk."
