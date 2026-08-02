#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <sql-file-relative-to-app-root>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SQL_RELATIVE_PATH="$1"
SQL_FILE="$APP_ROOT/$SQL_RELATIVE_PATH"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "SQL file not found: $SQL_FILE" >&2
  exit 1
fi

CONTAINER_NAME="psql-test-$(date +%s)-$RANDOM"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_test \
  -v "$APP_ROOT:/workspace:ro" \
  postgres:16-alpine >/dev/null

ready="false"
for _ in $(seq 1 200); do
  if docker logs "$CONTAINER_NAME" 2>&1 | grep -q "PostgreSQL init process complete; ready for start up" \
    && docker exec "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
    ready="true"
    break
  fi
done

if [[ "$ready" != "true" ]]; then
  echo "Timed out waiting for disposable Postgres container to become ready." >&2
  exit 1
fi

docker exec "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "/workspace/$SQL_RELATIVE_PATH"
