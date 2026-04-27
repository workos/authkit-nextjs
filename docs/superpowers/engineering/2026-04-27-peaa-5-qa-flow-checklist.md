# PEAA-5 QA Flow Checklist

## Purpose

Executable validation checklist for `Tasks`, `Meetings`, `Notes`, `Lists`, and `Today` flows in V1 scope.

## Preconditions

- Migrations applied in order: `0001_init_schema.sql`, `0002_indexes.sql`, `0003_seed_v1.sql`, `0004_execution_flow_functions.sql`, `0005_execution_flow_mutations.sql`, `0006_today_snapshot.sql`.
- Optional automated smoke validation script available: `9000_peaa5_smoke_tests.sql`.
- Seed org is loaded: `org_seed_peazy_v1`.
- Test members available:
  - `alex.admin@peazy.test` (`admin`)
  - `maya.manager@peazy.test` (`manager`)
  - `chris.csm@peazy.test` (`csm`)
  - `taylor.am@peazy.test` (`am`)

Quick start command:

```sql
\i docs/superpowers/engineering/sql/9000_peaa5_smoke_tests.sql
```

Full suite command:

```bash
DATABASE_URL=postgres://user:pass@host:5432/db ./docs/superpowers/engineering/scripts/run_peaa5_sql_suite.sh
```

## 1. Today Ordering

1. Query `get_today_tasks('org_seed_peazy_v1', '<csm-member-id>')`.
2. Confirm returned rows are grouped by `sort_bucket`:
   - `1`: overdue
   - `2`: due today
   - `3`: all others (including no due date)
3. Query `get_today_upcoming_meetings('org_seed_peazy_v1')` and confirm ascending `scheduled_at`.
4. Query `get_today_recent_customers('org_seed_peazy_v1')` and confirm descending `updated_at`.
5. Query `get_today_snapshot('org_seed_peazy_v1', '<csm-member-id>')` and confirm payload includes `tasks`, `upcomingMeetings`, `recentCustomers`, and `lists`.

Pass criteria:

- Ordering is deterministic and stable across repeated calls.

## 2. Task Status Transitions

1. Pick an `open` task.
2. Execute `transition_task_status(org, task_id, 'in_progress')`.
3. Execute `transition_task_status(org, task_id, 'done')`.
4. Verify `completed_at IS NOT NULL` when done.
5. Attempt invalid transition from `done` to `open`.

Pass criteria:

- Valid transitions succeed.
- Invalid transition fails with explicit error.

## 3. Meetings + Participants

1. Execute `create_meeting_with_participants(...)` for an active customer with two participant ids from the same customer.
2. Verify both participants were inserted in `meeting_participants`.
3. Attempt duplicate participant insert `(meeting_id, person_id)`.

Pass criteria:

- Duplicate participant insert is rejected by unique constraint.
- Meeting data remains consistent and queryable.

## 4. Notes Link Semantics

1. Execute `create_note_checked(...)` linked to `customer`.
2. Execute `create_note_checked(...)` linked to `person` from same customer.
3. Execute `create_note_checked(...)` linked to `meeting` from same customer.
4. Execute `create_note_checked(...)` linked to `task` from same customer.
5. Attempt link to foreign-org object id.

Pass criteria:

- Valid note links are persisted.
- Cross-org/mismatched links are rejected in application service layer.

## 5. Lists Membership Flows

1. Execute `add_customer_to_list(...)`.
2. Confirm list membership row exists.
3. Execute `add_customer_to_list(...)` again for the same list/customer pair.
4. Execute `remove_customer_from_list(...)`.

Pass criteria:

- Duplicate add blocked by unique `(list_id, customer_id)`.
- Remove operation is idempotent.

## 6. Role Guard Smoke Checks

1. `viewer` attempts mutation (task status change, list add/remove, note create).
2. `admin` performs same mutations.

Pass criteria:

- Viewer mutations are denied.
- Admin mutations succeed.

## 7. Regression Edge Checks

1. Time boundary check around local midnight for overdue vs due-today task bucket.
2. Delete customer and confirm cascade behavior for tasks/meetings/notes/people/list_membership.
3. Remove member and verify owned records remain with `owner_member_id` null where applicable.

Pass criteria:

- Behavior matches schema constraints and PEAA-5 plan.
