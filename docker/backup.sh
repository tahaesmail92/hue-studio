#!/bin/sh
# Nightly pg_dump with retention. We own backups now, so this runs as its own
# service rather than as a crontab entry nobody remembers to check.
#
# Copying the dumps OFF this box is a separate, deliberate step - see the
# README. A backup that only exists on the machine it protects is not a backup.
set -eu

HOST="${BACKUP_PG_HOST:-postgres}"
USER="${POSTGRES_USER:-hue}"
DB="${POSTGRES_DB:-hue_studio}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups

mkdir -p "$DIR"

while true; do
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  FILE="$DIR/${DB}-${STAMP}.sql.gz"

  if pg_dump -h "$HOST" -U "$USER" -d "$DB" | gzip > "$FILE.partial"; then
    mv "$FILE.partial" "$FILE"
    echo "[backup] wrote $FILE ($(du -h "$FILE" | cut -f1))"
  else
    rm -f "$FILE.partial"
    echo "[backup] FAILED at $STAMP" >&2
  fi

  # Prune old dumps, then report what is left so a silent failure is visible.
  find "$DIR" -name "${DB}-*.sql.gz" -mtime "+${KEEP_DAYS}" -delete
  echo "[backup] $(find "$DIR" -name "${DB}-*.sql.gz" | wc -l) dump(s) retained"

  sleep 86400
done
