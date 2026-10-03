#!/bin/bash
# Restores the tripreviewall database from a backup made by backup-db.sh.
# DESTRUCTIVE: completely replaces the current database contents.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | cut -d '=' -f2-)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set (checked $ENV_FILE and the environment)." >&2
  exit 1
fi

BACKUP_DIR="${TRIPREVIEWALL_BACKUP_DIR:-$HOME/tripreviewall-backups}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore-db.sh /path/to/backup.sql.gz"
  echo ""
  echo "Available backups in $BACKUP_DIR:"
  ls -lh "$BACKUP_DIR"/tripreviewall-*.sql.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: File not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "==================================================================="
echo "WARNING: this will COMPLETELY REPLACE the current database with:"
echo "    $BACKUP_FILE"
echo "This cannot be undone. Any data changed since that backup was made"
echo "will be permanently lost. Consider running backup-db.sh first to"
echo "capture the CURRENT state before restoring an older one."
echo "==================================================================="
read -r -p "Type 'yes' (exactly) to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted — nothing was changed."
  exit 1
fi

if ! gzip -t "$BACKUP_FILE"; then
  echo "ERROR: $BACKUP_FILE is not a valid .gz file — refusing to restore." >&2
  exit 1
fi

# Safety net: snapshot the CURRENT database first, so a wrong restore can be undone.
SAFETY_FILE="$BACKUP_DIR/tripreviewall-before-restore-$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
mkdir -p "$BACKUP_DIR"
echo "Saving the current database to $SAFETY_FILE first ..."
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$SAFETY_FILE"

# One transaction: drop every table in the public schema, then load the
# backup. ON_ERROR_STOP + --single-transaction means it either fully succeeds
# or changes nothing — no half-restored database. (Works for backups made
# before and after this script was updated.)
echo "Restoring from $BACKUP_FILE ..."
{
  cat <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
SQL
  gunzip -c "$BACKUP_FILE"
} | psql -v ON_ERROR_STOP=1 --single-transaction --quiet "$DATABASE_URL"
echo "Restore complete. (Previous state saved in $SAFETY_FILE)"
echo "Remember to restart the admin app: pm2 restart tripreviewall-admin"
