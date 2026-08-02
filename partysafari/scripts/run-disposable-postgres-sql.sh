#!/usr/bin/env bash
set -euo pipefail

script_path="${1:-}"
if [[ -z "$script_path" ]]; then
  echo "Usage: $0 <sql-file>" >&2
  exit 2
fi

if [[ ! -f "$script_path" ]]; then
  echo "SQL fixture not found: $script_path" >&2
  exit 2
fi

container_name="partysafari-sql-$$"
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --name "$container_name" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -d postgres:16 >/dev/null

for _ in {1..30}; do
  if docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker cp "$script_path" "$container_name":/tmp/fixture.sql

docker exec "$container_name" psql -U postgres -d postgres -f /tmp/fixture.sql
