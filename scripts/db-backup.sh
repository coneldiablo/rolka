#!/usr/bin/env sh
set -eu

SERVICE="${SERVICE:-db}"
DATABASE="${DATABASE:-rolka}"
USER="${POSTGRES_USER:-postgres}"
OUTPUT_DIR="${OUTPUT_DIR:-backups}"

mkdir -p "$OUTPUT_DIR"

CONTAINER_ID="$(docker compose ps -q "$SERVICE")"
if [ -z "$CONTAINER_ID" ]; then
  echo "Postgres service '$SERVICE' is not running." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TMP_FILE="/tmp/rolka-$TIMESTAMP.dump"
OUTPUT_FILE="$OUTPUT_DIR/rolka-$TIMESTAMP.dump"

docker compose exec -T "$SERVICE" pg_dump -U "$USER" -d "$DATABASE" --format=custom --file="$TMP_FILE"
docker cp "$CONTAINER_ID:$TMP_FILE" "$OUTPUT_FILE"
docker compose exec -T "$SERVICE" rm -f "$TMP_FILE"

echo "Backup saved to $OUTPUT_FILE"
