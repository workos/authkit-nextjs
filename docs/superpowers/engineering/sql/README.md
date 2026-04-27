# PEAA-2 SQL Apply/Verify Runbook

## Prerequisites

- PostgreSQL 16+
- `psql` CLI available in PATH

## Apply Order

Run from repo root:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/superpowers/engineering/sql/0001_init_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/superpowers/engineering/sql/0002_indexes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/superpowers/engineering/sql/0003_seed_v1.sql
```

Or run the full suite script:

```bash
DATABASE_URL="$DATABASE_URL" ./docs/superpowers/engineering/scripts/run_peaa2_sql_suite.sh
```

## Verification

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/superpowers/engineering/sql/verify_v1_read_paths.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/superpowers/engineering/sql/verify_v1_assertions.sql
```

Expected checks:

- 8 customers
- 24 people
- 32 tasks
- 16 meetings
- 32 notes
- 4 lists
- at least one overdue and one due-today open/in-progress task
- customer-detail join returns rows for active customers
- assertion script exits successfully and prints `PEAA-2 assertions passed`

## Rollback Guidance

- Development: recreate database and reapply migrations.
- Shared/prod: use forward-fix migration only.
