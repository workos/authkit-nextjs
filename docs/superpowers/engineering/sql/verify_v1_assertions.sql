-- Hard assertions for PEAA-2 schema + seed.
-- Fails fast with exceptions when required invariants are broken.

DO $$
DECLARE
  v_members_count INTEGER;
  v_customers_count INTEGER;
  v_people_count INTEGER;
  v_tasks_count INTEGER;
  v_meetings_count INTEGER;
  v_notes_count INTEGER;
  v_lists_count INTEGER;
  v_overdue_open_tasks INTEGER;
  v_due_today_open_tasks INTEGER;
  v_active_customers_without_graph INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_members_count
  FROM members
  WHERE organization_id = 'org_seed_peazy_v1';

  SELECT COUNT(*) INTO v_customers_count
  FROM customers
  WHERE organization_id = 'org_seed_peazy_v1';

  SELECT COUNT(*) INTO v_people_count
  FROM people
  WHERE organization_id = 'org_seed_peazy_v1';

  SELECT COUNT(*) INTO v_tasks_count
  FROM tasks
  WHERE organization_id = 'org_seed_peazy_v1';

  SELECT COUNT(*) INTO v_meetings_count
  FROM meetings
  WHERE organization_id = 'org_seed_peazy_v1';

  SELECT COUNT(*) INTO v_notes_count
  FROM notes
  WHERE organization_id = 'org_seed_peazy_v1';

  SELECT COUNT(*) INTO v_lists_count
  FROM lists
  WHERE organization_id = 'org_seed_peazy_v1';

  IF v_members_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 members, got %', v_members_count;
  END IF;

  IF v_customers_count <> 8 THEN
    RAISE EXCEPTION 'Expected 8 customers, got %', v_customers_count;
  END IF;

  IF v_people_count <> 24 THEN
    RAISE EXCEPTION 'Expected 24 people, got %', v_people_count;
  END IF;

  IF v_tasks_count <> 32 THEN
    RAISE EXCEPTION 'Expected 32 tasks, got %', v_tasks_count;
  END IF;

  IF v_meetings_count <> 16 THEN
    RAISE EXCEPTION 'Expected 16 meetings, got %', v_meetings_count;
  END IF;

  IF v_notes_count <> 32 THEN
    RAISE EXCEPTION 'Expected 32 notes, got %', v_notes_count;
  END IF;

  IF v_lists_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 lists, got %', v_lists_count;
  END IF;

  SELECT COUNT(*) INTO v_overdue_open_tasks
  FROM tasks
  WHERE organization_id = 'org_seed_peazy_v1'
    AND status IN ('open', 'in_progress')
    AND due_at < NOW();

  IF v_overdue_open_tasks < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 overdue open/in-progress task, got %', v_overdue_open_tasks;
  END IF;

  SELECT COUNT(*) INTO v_due_today_open_tasks
  FROM tasks
  WHERE organization_id = 'org_seed_peazy_v1'
    AND status IN ('open', 'in_progress')
    AND due_at >= date_trunc('day', NOW())
    AND due_at < date_trunc('day', NOW()) + INTERVAL '1 day';

  IF v_due_today_open_tasks < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 due-today open/in-progress task, got %', v_due_today_open_tasks;
  END IF;

  WITH graph_counts AS (
    SELECT
      c.id,
      COUNT(DISTINCT p.id) AS people_count,
      COUNT(DISTINCT t.id) AS tasks_count,
      COUNT(DISTINCT m.id) AS meetings_count,
      COUNT(DISTINCT n.id) AS notes_count
    FROM customers c
    LEFT JOIN people p
      ON p.customer_id = c.id
      AND p.organization_id = c.organization_id
    LEFT JOIN tasks t
      ON t.customer_id = c.id
      AND t.organization_id = c.organization_id
    LEFT JOIN meetings m
      ON m.customer_id = c.id
      AND m.organization_id = c.organization_id
    LEFT JOIN notes n
      ON n.customer_id = c.id
      AND n.organization_id = c.organization_id
    WHERE c.organization_id = 'org_seed_peazy_v1'
      AND c.status = 'active'
    GROUP BY c.id
  )
  SELECT COUNT(*) INTO v_active_customers_without_graph
  FROM graph_counts gc
  WHERE gc.people_count = 0 OR gc.tasks_count = 0 OR gc.meetings_count = 0 OR gc.notes_count = 0;

  IF v_active_customers_without_graph <> 0 THEN
    RAISE EXCEPTION 'Expected every active customer to have people/tasks/meetings/notes, but % customer(s) failed', v_active_customers_without_graph;
  END IF;

  RAISE NOTICE 'PEAA-2 assertions passed: schema + seed support Today and customer-detail read paths.';
END
$$;
