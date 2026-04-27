# PEAA-2 Follow-up Task Pack

Use these as child implementation tickets after closing PEAA-2.

Machine-readable payload:

- `docs/superpowers/engineering/peaa-2-child-issues.json`

## Child Task 1: Staff Engineer — App Migration Integration

Owner: Staff Engineer  
Priority: High

Scope:

- integrate SQL artifacts into target app migration runner
- enforce migration order in deploy pipeline
- expose one command for local and CI DB setup

Inputs:

- `docs/superpowers/engineering/sql/0001_init_schema.sql`
- `docs/superpowers/engineering/sql/0002_indexes.sql`
- `docs/superpowers/engineering/sql/0003_seed_v1.sql`
- `docs/superpowers/engineering/scripts/run_peaa2_sql_suite.sh`

Acceptance:

- migration runner applies all PEAA-2 files in order
- local developer setup can bootstrap DB with one documented command
- no drift between app migration tooling and SQL source files

## Child Task 2: QA Engineer — DB Verification Gate

Owner: QA Engineer  
Priority: High

Scope:

- execute SQL suite in ephemeral CI Postgres
- fail build if assertions fail
- publish seed/read-path verification output in CI artifacts

Inputs:

- `docs/superpowers/engineering/sql/verify_v1_read_paths.sql`
- `docs/superpowers/engineering/sql/verify_v1_assertions.sql`
- `docs/superpowers/engineering/scripts/run_peaa2_sql_suite.sh`

Acceptance:

- CI runs PEAA-2 suite on each relevant PR
- assertion script is blocking
- CI artifacts include row counts and assertion output

## Child Task 3: Release Engineer — Rollout Runbook

Owner: Release Engineer  
Priority: Medium

Scope:

- define staging and production DB rollout checklist
- require backup snapshot before migration execution
- define forward-fix protocol for failed migrations

Inputs:

- `docs/superpowers/engineering/sql/README.md`
- `docs/superpowers/engineering/peaa-2-handoff-report.md`

Acceptance:

- release checklist includes DB backup, apply order, and rollback/forward-fix decision tree
- staging dry-run is mandatory before production
- production migration command and owner are explicitly recorded per release
