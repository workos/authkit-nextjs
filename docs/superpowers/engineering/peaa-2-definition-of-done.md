# PEAA-2 Definition of Done

## Scope

Issue: `PEAA-2` (PEAA-1.2 Data Model, Migrations, Seed)

Goal:

- create concrete relational schema for core V1 objects
- provide migrations and seed package
- ensure customer graph supports Today and customer-detail reads

## DoD Traceability

1. Relational schema for required objects
- Status: PASS
- Evidence:
  - `docs/superpowers/engineering/sql/0001_init_schema.sql`
  - includes `members`, `customers`, `people`, `tasks`, `meetings`, `meeting_participants`, `notes`, `lists`, `list_customers`

2. Indexes for org/customer/task lookups
- Status: PASS
- Evidence:
  - `docs/superpowers/engineering/sql/0002_indexes.sql`
  - org-scoped lookup indexes and uniqueness constraints

3. Deterministic seed data package
- Status: PASS
- Evidence:
  - `docs/superpowers/engineering/sql/0003_seed_v1.sql`
  - deterministic IDs and org-scoped reset/insert flow

4. Schema + seed are applied successfully
- Status: PASS
- Evidence:
  - SQL suite executed against PostgreSQL 16 using:
    - `docs/superpowers/engineering/scripts/run_peaa2_sql_suite.sh`
  - run completed with success message

5. Customer graph supports Today and customer-detail screens
- Status: PASS
- Evidence:
  - `docs/superpowers/engineering/sql/verify_v1_read_paths.sql`
  - `docs/superpowers/engineering/sql/verify_v1_assertions.sql`
  - assertions pass with notice:
    - `PEAA-2 assertions passed: schema + seed support Today and customer-detail read paths.`

## Risks / Follow-up (Out of Scope)

- Integrate SQL files into target app migration tooling (`drizzle-kit` / `prisma migrate` / equivalent).
- Add CI job that executes `run_peaa2_sql_suite.sh` on ephemeral Postgres for regression protection.

## Close Recommendation

PEAA-2 is technically complete for scoped deliverables and is ready to close once the board records ownership for app-integration follow-up work.

Follow-up task pack:

- `docs/superpowers/engineering/peaa-2-follow-up-tasks.md`
- `docs/superpowers/engineering/peaa-2-artifact-index.md`
