#!/usr/bin/env bash
set -euo pipefail

# Runs PEAA-5 SQL migrations and smoke tests in order.
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./docs/superpowers/engineering/scripts/run_peaa5_sql_suite.sh
#
# Optional:
#   SQL_BASE_DIR=/abs/path/to/sql ./docs/superpowers/engineering/scripts/run_peaa5_sql_suite.sh

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not found in PATH." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SQL_DIR="${SQL_BASE_DIR:-$REPO_ROOT/docs/superpowers/engineering/sql}"

required_files=(
  "0001_init_schema.sql"
  "0002_indexes.sql"
  "0003_seed_v1.sql"
  "0004_execution_flow_functions.sql"
  "0005_execution_flow_mutations.sql"
  "0006_today_snapshot.sql"
  "9000_peaa5_smoke_tests.sql"
)

for f in "${required_files[@]}"; do
  if [[ ! -f "$SQL_DIR/$f" ]]; then
    echo "Missing SQL file: $SQL_DIR/$f" >&2
    exit 1
  fi
done

run_sql_file() {
  local file="$1"
  echo "==> Applying $file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_DIR/$file"
}

for f in "${required_files[@]}"; do
  run_sql_file "$f"
done

echo "PEAA-5 SQL suite completed successfully."
