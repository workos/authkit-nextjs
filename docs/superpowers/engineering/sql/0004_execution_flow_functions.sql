-- PEAA-5 execution-flow SQL primitives.
-- These functions lock task transition semantics and deterministic Today ordering.

CREATE OR REPLACE FUNCTION transition_task_status(
  p_organization_id TEXT,
  p_task_id UUID,
  p_next_status task_status
)
RETURNS tasks
LANGUAGE plpgsql
AS $$
DECLARE
  v_task tasks%ROWTYPE;
BEGIN
  SELECT *
  INTO v_task
  FROM tasks
  WHERE id = p_task_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found for org';
  END IF;

  IF v_task.status = p_next_status THEN
    RETURN v_task;
  END IF;

  IF v_task.status = 'open' AND p_next_status IN ('in_progress', 'canceled') THEN
    NULL;
  ELSIF v_task.status = 'in_progress' AND p_next_status IN ('done', 'canceled') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Invalid task transition: % -> %', v_task.status, p_next_status;
  END IF;

  UPDATE tasks
  SET
    status = p_next_status,
    completed_at = CASE WHEN p_next_status = 'done' THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = v_task.id
    AND organization_id = p_organization_id
  RETURNING *
  INTO v_task;

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION get_today_tasks(
  p_organization_id TEXT,
  p_member_id UUID,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  task_id UUID,
  customer_id UUID,
  title TEXT,
  status task_status,
  priority task_priority,
  due_at TIMESTAMPTZ,
  sort_bucket INTEGER
)
LANGUAGE sql
AS $$
  SELECT
    t.id AS task_id,
    t.customer_id,
    t.title,
    t.status,
    t.priority,
    t.due_at,
    CASE
      WHEN t.due_at IS NOT NULL AND t.due_at < p_now THEN 1
      WHEN t.due_at IS NOT NULL AND t.due_at::date = p_now::date THEN 2
      ELSE 3
    END AS sort_bucket
  FROM tasks t
  WHERE t.organization_id = p_organization_id
    AND t.owner_member_id = p_member_id
    AND t.status IN ('open', 'in_progress')
  ORDER BY
    sort_bucket ASC,
    t.due_at ASC NULLS LAST,
    t.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_today_upcoming_meetings(
  p_organization_id TEXT,
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  meeting_id UUID,
  customer_id UUID,
  title TEXT,
  scheduled_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  SELECT
    m.id AS meeting_id,
    m.customer_id,
    m.title,
    m.scheduled_at
  FROM meetings m
  WHERE m.organization_id = p_organization_id
    AND m.scheduled_at >= p_now
  ORDER BY m.scheduled_at ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_today_recent_customers(
  p_organization_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  customer_id UUID,
  name TEXT,
  lifecycle_stage customer_lifecycle_stage,
  status record_status,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  SELECT
    c.id AS customer_id,
    c.name,
    c.lifecycle_stage,
    c.status,
    c.updated_at
  FROM customers c
  WHERE c.organization_id = p_organization_id
  ORDER BY c.updated_at DESC
  LIMIT p_limit;
$$;
