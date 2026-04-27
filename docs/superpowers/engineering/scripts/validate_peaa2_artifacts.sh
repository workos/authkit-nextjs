#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
BASE="$REPO_ROOT/docs/superpowers/engineering"

required=(
  "$BASE/2026-04-27-peaa-2-data-model-migrations-seed-plan.md"
  "$BASE/peaa-2-handoff-report.md"
  "$BASE/peaa-2-definition-of-done.md"
  "$BASE/peaa-2-follow-up-tasks.md"
  "$BASE/peaa-2-child-issues.json"
  "$BASE/peaa-2-artifact-index.md"
  "$BASE/peaa-2-close-comment-template.md"
  "$BASE/sql/0001_init_schema.sql"
  "$BASE/sql/0002_indexes.sql"
  "$BASE/sql/0003_seed_v1.sql"
  "$BASE/sql/verify_v1_read_paths.sql"
  "$BASE/sql/verify_v1_assertions.sql"
  "$BASE/sql/README.md"
  "$BASE/scripts/run_peaa2_sql_suite.sh"
)

missing=0
for f in "${required[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "MISSING: $f" >&2
    missing=1
  fi
done

if [[ $missing -ne 0 ]]; then
  echo "PEAA-2 artifact validation failed." >&2
  exit 1
fi

echo "PEAA-2 artifact validation passed."
