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

# --no-owner/--no-privileges: restorable by the app's own DB user on any server.
# The restore script empties the database itself, so no --clean needed here.
if pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$BACKUP_FILE" && gzip -t "$BACKUP_FILE" && [ -s "$BACKUP_FILE" ]; then
  SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
  echo "[$(date)] Backup succeeded: $BACKUP_FILE ($SIZE)"
else
  echo "[$(date)] Backup FAILED — removing partial file." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Optional off-server copy (B4): a backup on the same disk as the database
# doesn't survive losing the VPS. Set TRIPREVIEWALL_BACKUP_REMOTE in the cron
# line or ~/.profile to an scp/rsync target, e.g. "backup@1.2.3.4:/backups/tripreviewall/".
if [ -n "${TRIPREVIEWALL_BACKUP_REMOTE:-}" ]; then
  if rsync -az "$BACKUP_FILE" "$TRIPREVIEWALL_BACKUP_REMOTE"; then
    echo "[$(date)] Copied off-server to $TRIPREVIEWALL_BACKUP_REMOTE"
  else
    echo "[$(date)] WARNING: off-server copy to $TRIPREVIEWALL_BACKUP_REMOTE failed (local backup is fine)." >&2
  fi
fi

# Retention: delete backups older than N days so the disk doesn't fill up.
DELETED_COUNT="$(find "$BACKUP_DIR" -name 'tripreviewall-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
if [ "$DELETED_COUNT" -gt 0 ]; then
  echo "[$(date)] Cleaned up $DELETED_COUNT backup(s) older than $RETENTION_DAYS days."
fi

echo "[$(date)] Done. $(find "$BACKUP_DIR" -name 'tripreviewall-*.sql.gz' | wc -l) backup(s) currently on disk."
