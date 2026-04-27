# PEAA-2 Artifact Index

Canonical index for all PEAA-2 deliverables.

## Core SQL Deliverables

- `docs/superpowers/engineering/sql/0001_init_schema.sql`
  - Purpose: core schema, constraints, and guard triggers
  - Consumer: Staff Engineer
- `docs/superpowers/engineering/sql/0002_indexes.sql`
  - Purpose: org/customer/task/query-path indexes
  - Consumer: Staff Engineer
- `docs/superpowers/engineering/sql/0003_seed_v1.sql`
  - Purpose: deterministic V1 seed data package
  - Consumer: Staff Engineer, QA Engineer

## Verification Deliverables

- `docs/superpowers/engineering/sql/verify_v1_read_paths.sql`
  - Purpose: visibility checks for Today and customer-detail reads
  - Consumer: QA Engineer
- `docs/superpowers/engineering/sql/verify_v1_assertions.sql`
  - Purpose: hard pass/fail assertions for seed and graph integrity
  - Consumer: QA Engineer

## Execution Scripts

- `docs/superpowers/engineering/scripts/run_peaa2_sql_suite.sh`
  - Purpose: one-command apply + verification runner
  - Consumer: Staff Engineer, QA Engineer, CI
- `docs/superpowers/engineering/scripts/validate_peaa2_artifacts.sh`
  - Purpose: pre-close artifact existence validator
  - Consumer: issue owner / board operator

## Operational Documentation

- `docs/superpowers/engineering/sql/README.md`
  - Purpose: apply/verify runbook
  - Consumer: Staff Engineer, Release Engineer
- `docs/superpowers/engineering/2026-04-27-peaa-2-data-model-migrations-seed-plan.md`
  - Purpose: locked technical execution plan + evidence
  - Consumer: Engineering leadership
- `docs/superpowers/engineering/peaa-2-handoff-report.md`
  - Purpose: final engineering handoff summary
  - Consumer: Staff Engineer, QA Engineer, Release Engineer
- `docs/superpowers/engineering/peaa-2-definition-of-done.md`
  - Purpose: DoD traceability and close recommendation
  - Consumer: Engineering leadership, board
- `docs/superpowers/engineering/peaa-2-follow-up-tasks.md`
  - Purpose: human-readable child-task pack
  - Consumer: Engineering manager / assignees
- `docs/superpowers/engineering/peaa-2-child-issues.json`
  - Purpose: machine-readable child-issue payload
  - Consumer: board automation / issue tooling
- `docs/superpowers/engineering/peaa-2-close-comment-template.md`
  - Purpose: board-ready close comment text
  - Consumer: issue owner / board operator
- `docs/superpowers/engineering/peaa-2-board-payload.json`
  - Purpose: machine-readable board close payload
  - Consumer: board automation / issue tooling

## Runtime Validation Status

- PostgreSQL 16 apply/verify run: PASS
- `run_peaa2_sql_suite.sh` on fresh `peaa2_ci`: PASS
- Assertion notice: `PEAA-2 assertions passed: schema + seed support Today and customer-detail read paths.`

## Ready State

PEAA-2 deliverables are complete and verified for scoped objective.
Recommended board action:

1. Close PEAA-2.
2. Create child issues from `peaa-2-child-issues.json`.
3. Assign child issues to Staff Engineer, QA Engineer, and Release Engineer.
