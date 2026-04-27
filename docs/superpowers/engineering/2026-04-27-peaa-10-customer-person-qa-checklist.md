# PEAA-10 Customer + Person QA Checklist

## Purpose

Executable verification matrix for customer and person surfaces with org-scoped safety invariants.

## Preconditions

- Apply migrations in order:
  - `0001_init_schema.sql`
  - `0002_indexes.sql`
  - `0003_seed_v1.sql`
  - `0004_execution_flow_functions.sql`
  - `0005_customer_person_surface_functions.sql`
- Seed org loaded: `org_seed_peazy_v1`.
- Quick-run harness available: `docs/superpowers/engineering/sql/run_peaa10_verification.sh`.

## 1. Customer List + Metrics

1. Run `get_customers_with_metrics('org_seed_peazy_v1')`.
2. Confirm rows are sorted by `updated_at DESC`.
3. For at least one customer, cross-check `open_tasks_count` and `upcoming_meeting_at` against direct table queries.
4. Run with search text and verify only matching names are returned.

Pass criteria:
- Deterministic ordering.
- Metrics are accurate and org-scoped.

## 2. Customer Detail Bundle

1. Pick a seeded customer ID.
2. Run `get_customer_detail_bundle(org, customer_id)`.
3. Verify `people_count`, `open_tasks_count`, `upcoming_meetings_count`, and `notes_count` match direct count queries.
4. Query same customer ID from another org and confirm zero rows.

Pass criteria:
- Detail bundle is consistent and tenant isolated.

## 3. Customer CRUD Org Boundaries

1. Create customer with `create_customer_record` using valid owner from same org.
2. Update same customer with `update_customer_record`.
3. Attempt update using wrong `organization_id`.
4. Attempt create/update with owner member from another org.
5. Delete via `delete_customer_record` and verify cascade behavior on dependent rows.

Pass criteria:
- Cross-org operations fail.
- Wrong-org owner references fail.
- Valid same-org operations succeed.

## 4. Person CRUD Linked to Customer

1. Create person via `create_person_record` for a valid same-org customer.
2. Attempt create for nonexistent or foreign-org customer.
3. Update person via `update_person_record` and verify timestamps change.
4. Attempt update with wrong `organization_id`.
5. Delete via `delete_person_record` and verify row removed.

Pass criteria:
- Person writes require existing same-org customer.
- Wrong-org mutations fail/return false.

## 5. Member-Org and Note-Link Guards

1. Insert customer/task/note/list with member reference from foreign org.
2. Confirm trigger rejects write.
3. Insert note with only one of `linked_object_type` or `linked_object_id` set.
4. Insert note with mismatched linked object customer/org.

Pass criteria:
- Trigger-based member org guards fire.
- Note link pair check and linked target guard enforce invariants.

## 6. Regression Cases

1. Retry same customer creation request payload twice.
2. Retry same person creation payload twice with same email.
3. Concurrently assign different owners to same customer.

Pass criteria:
- Expected uniqueness failures occur where constrained.
- No cross-org data corruption from concurrent updates.

## Sign-off Conditions

- All sections pass for `admin` and `manager` roles.
- Negative tests demonstrate rejection of wrong-org identifiers.
- Results logged with query snippets and timestamps.
