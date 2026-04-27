-- PEAA-5 smoke tests
-- Execute after 0001..0005 migrations on a disposable database.
-- This script raises exceptions when invariants fail.

BEGIN;

-- Keep smoke tests isolated and reversible.
SAVEPOINT peaa5_smoke;

DO $$
DECLARE
  v_org TEXT := 'org_seed_peazy_v1';
  v_csm UUID := '10000000-0000-4000-8000-000000000003';
  v_customer UUID := '20000000-0000-4000-8000-000000000001';
  v_list UUID := '30000000-0000-4000-8000-000000000004';
  v_task UUID;
  v_prev_bucket INTEGER := 0;
  v_bucket INTEGER;
  v_meeting_id UUID;
  v_person_1 UUID;
  v_person_2 UUID;
  v_note_id UUID;
  v_rows INTEGER;
  v_removed BOOLEAN;
  v_failed BOOLEAN := FALSE;
  v_snapshot JSONB;
BEGIN
  -- Seed cardinality sanity.
  SELECT COUNT(*) INTO v_rows FROM members WHERE organization_id = v_org;
  IF v_rows < 3 OR v_rows > 5 THEN
    RAISE EXCEPTION 'Seed cardinality invalid for members: %', v_rows;
  END IF;

  SELECT COUNT(*) INTO v_rows FROM customers WHERE organization_id = v_org;
  IF v_rows < 8 OR v_rows > 12 THEN
    RAISE EXCEPTION 'Seed cardinality invalid for customers: %', v_rows;
  END IF;

  SELECT COUNT(*) INTO v_rows FROM tasks WHERE organization_id = v_org;
  IF v_rows < 30 OR v_rows > 50 THEN
    RAISE EXCEPTION 'Seed cardinality invalid for tasks: %', v_rows;
  END IF;

  -- Today ordering: buckets must be non-decreasing.
  FOR v_bucket IN
    SELECT sort_bucket
    FROM get_today_tasks(v_org, v_csm, NOW())
  LOOP
    IF v_bucket < v_prev_bucket THEN
      RAISE EXCEPTION 'Today task ordering invalid: bucket % after %', v_bucket, v_prev_bucket;
    END IF;
    v_prev_bucket := v_bucket;
  END LOOP;

  -- Task transition flow: open -> in_progress -> done; done -> open must fail.
  SELECT t.id
  INTO v_task
  FROM tasks t
  WHERE t.organization_id = v_org
    AND t.status = 'open'
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'No open task available for transition smoke test';
  END IF;

  PERFORM transition_task_status(v_org, v_task, 'in_progress');
  PERFORM transition_task_status(v_org, v_task, 'done');

  SELECT COUNT(*)
  INTO v_rows
  FROM tasks
  WHERE id = v_task
    AND status = 'done'
    AND completed_at IS NOT NULL;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Task transition completion invariant failed for task %', v_task;
  END IF;

  BEGIN
    PERFORM transition_task_status(v_org, v_task, 'open');
  EXCEPTION
    WHEN OTHERS THEN
      v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Invalid transition done -> open did not fail';
  END IF;

  v_failed := FALSE;

  -- List membership idempotency.
  PERFORM add_customer_to_list(v_org, v_list, v_customer);
  PERFORM add_customer_to_list(v_org, v_list, v_customer);

  SELECT COUNT(*)
  INTO v_rows
  FROM list_customers
  WHERE organization_id = v_org
    AND list_id = v_list
    AND customer_id = v_customer;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'List membership idempotency failed; expected 1 row, found %', v_rows;
  END IF;

  SELECT remove_customer_from_list(v_org, v_list, v_customer)
  INTO v_removed;
  IF v_removed IS NOT TRUE THEN
    RAISE EXCEPTION 'remove_customer_from_list should return true for existing membership';
  END IF;

  SELECT remove_customer_from_list(v_org, v_list, v_customer)
  INTO v_removed;
  IF v_removed IS NOT FALSE THEN
    RAISE EXCEPTION 'remove_customer_from_list should return false for already removed membership';
  END IF;

  -- Meeting + participants flow.
  SELECT p.id INTO v_person_1
  FROM people p
  WHERE p.organization_id = v_org
    AND p.customer_id = v_customer
  ORDER BY p.email
  LIMIT 1;

  SELECT p.id INTO v_person_2
  FROM people p
  WHERE p.organization_id = v_org
    AND p.customer_id = v_customer
  ORDER BY p.email
  OFFSET 1
  LIMIT 1;

  IF v_person_1 IS NULL OR v_person_2 IS NULL THEN
    RAISE EXCEPTION 'Not enough participants for meeting smoke test';
  END IF;

  SELECT (create_meeting_with_participants(
    v_org,
    v_customer,
    'Smoke Test Meeting',
    'https://meet.example.com/smoke',
    NOW() + INTERVAL '2 days',
    30,
    'Smoke',
    'Smoke notes',
    ARRAY[v_person_1, v_person_2],
    'Smoke follow-up',
    'Created by smoke test',
    NOW() + INTERVAL '3 days',
    v_csm,
    'medium'
  )).id
  INTO v_meeting_id;

  SELECT COUNT(*)
  INTO v_rows
  FROM meeting_participants mp
  WHERE mp.organization_id = v_org
    AND mp.meeting_id = v_meeting_id;

  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'Meeting participants insert failed; expected 2 rows, found %', v_rows;
  END IF;

  -- Note link validation.
  SELECT (create_note_checked(
    v_org,
    v_customer,
    'Smoke note',
    'Valid customer-linked note',
    v_csm,
    'customer',
    v_customer
  )).id INTO v_note_id;

  IF v_note_id IS NULL THEN
    RAISE EXCEPTION 'Expected note creation to succeed';
  END IF;

  BEGIN
    PERFORM create_note_checked(
      v_org,
      v_customer,
      'Smoke invalid note',
      'Mismatched customer link',
      v_csm,
      'customer',
      '20000000-0000-4000-8000-000000000002'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'Expected create_note_checked to fail for mismatched customer link';
  END IF;

  -- Today snapshot contract validation.
  SELECT get_today_snapshot(v_org, v_csm, NOW())
  INTO v_snapshot;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Expected get_today_snapshot to return JSON payload';
  END IF;

  IF NOT (v_snapshot ? 'tasks' AND v_snapshot ? 'upcomingMeetings' AND v_snapshot ? 'recentCustomers' AND v_snapshot ? 'lists') THEN
    RAISE EXCEPTION 'Today snapshot payload missing required keys';
  END IF;
END;
$$;

ROLLBACK TO SAVEPOINT peaa5_smoke;
RELEASE SAVEPOINT peaa5_smoke;
COMMIT;
