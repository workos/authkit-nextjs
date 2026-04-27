-- PEAA-5 mutation primitives for Lists, Notes, and Meetings.
-- These functions enforce organization and customer consistency in SQL.

CREATE OR REPLACE FUNCTION add_customer_to_list(
  p_organization_id TEXT,
  p_list_id UUID,
  p_customer_id UUID
)
RETURNS list_customers
LANGUAGE plpgsql
AS $$
DECLARE
  v_row list_customers%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM lists l
    WHERE l.id = p_list_id
      AND l.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'List not found for org';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Customer not found for org';
  END IF;

  INSERT INTO list_customers (organization_id, list_id, customer_id)
  VALUES (p_organization_id, p_list_id, p_customer_id)
  ON CONFLICT (list_id, customer_id) DO NOTHING
  RETURNING *
  INTO v_row;

  IF NOT FOUND THEN
    SELECT *
    INTO v_row
    FROM list_customers lc
    WHERE lc.organization_id = p_organization_id
      AND lc.list_id = p_list_id
      AND lc.customer_id = p_customer_id;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION remove_customer_from_list(
  p_organization_id TEXT,
  p_list_id UUID,
  p_customer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM list_customers lc
  WHERE lc.organization_id = p_organization_id
    AND lc.list_id = p_list_id
    AND lc.customer_id = p_customer_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION create_note_checked(
  p_organization_id TEXT,
  p_customer_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_author_member_id UUID,
  p_linked_object_type note_linked_object_type DEFAULT NULL,
  p_linked_object_id UUID DEFAULT NULL
)
RETURNS notes
LANGUAGE plpgsql
AS $$
DECLARE
  v_note notes%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Customer not found for org';
  END IF;

  IF (p_linked_object_type IS NULL) <> (p_linked_object_id IS NULL) THEN
    RAISE EXCEPTION 'linked_object_type and linked_object_id must both be set or both be null';
  END IF;

  IF p_linked_object_type = 'customer' THEN
    IF p_linked_object_id <> p_customer_id THEN
      RAISE EXCEPTION 'customer-linked note must link to the same customer';
    END IF;
  ELSIF p_linked_object_type = 'person' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM people p
      WHERE p.id = p_linked_object_id
        AND p.organization_id = p_organization_id
        AND p.customer_id = p_customer_id
    ) THEN
      RAISE EXCEPTION 'Person link invalid for org/customer';
    END IF;
  ELSIF p_linked_object_type = 'meeting' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM meetings m
      WHERE m.id = p_linked_object_id
        AND m.organization_id = p_organization_id
        AND m.customer_id = p_customer_id
    ) THEN
      RAISE EXCEPTION 'Meeting link invalid for org/customer';
    END IF;
  ELSIF p_linked_object_type = 'task' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM tasks t
      WHERE t.id = p_linked_object_id
        AND t.organization_id = p_organization_id
        AND t.customer_id = p_customer_id
    ) THEN
      RAISE EXCEPTION 'Task link invalid for org/customer';
    END IF;
  END IF;

  INSERT INTO notes (
    organization_id,
    customer_id,
    title,
    body,
    author_member_id,
    linked_object_type,
    linked_object_id
  )
  VALUES (
    p_organization_id,
    p_customer_id,
    p_title,
    p_body,
    p_author_member_id,
    p_linked_object_type,
    p_linked_object_id
  )
  RETURNING *
  INTO v_note;

  RETURN v_note;
END;
$$;

CREATE OR REPLACE FUNCTION create_meeting_with_participants(
  p_organization_id TEXT,
  p_customer_id UUID,
  p_title TEXT,
  p_meeting_url TEXT DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  p_duration_minutes INTEGER DEFAULT NULL,
  p_summary TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_participant_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_followup_task_title TEXT DEFAULT NULL,
  p_followup_task_description TEXT DEFAULT NULL,
  p_followup_task_due_at TIMESTAMPTZ DEFAULT NULL,
  p_followup_task_owner_member_id UUID DEFAULT NULL,
  p_followup_task_priority task_priority DEFAULT 'medium'
)
RETURNS meetings
LANGUAGE plpgsql
AS $$
DECLARE
  v_meeting meetings%ROWTYPE;
  v_person_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Customer not found for org';
  END IF;

  INSERT INTO meetings (
    organization_id,
    customer_id,
    title,
    meeting_url,
    scheduled_at,
    duration_minutes,
    summary,
    notes
  )
  VALUES (
    p_organization_id,
    p_customer_id,
    p_title,
    p_meeting_url,
    p_scheduled_at,
    p_duration_minutes,
    p_summary,
    p_notes
  )
  RETURNING *
  INTO v_meeting;

  FOREACH v_person_id IN ARRAY p_participant_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM people p
      WHERE p.id = v_person_id
        AND p.organization_id = p_organization_id
        AND p.customer_id = p_customer_id
    ) THEN
      RAISE EXCEPTION 'Participant % invalid for org/customer', v_person_id;
    END IF;

    INSERT INTO meeting_participants (organization_id, meeting_id, person_id)
    VALUES (p_organization_id, v_meeting.id, v_person_id)
    ON CONFLICT (meeting_id, person_id) DO NOTHING;
  END LOOP;

  IF p_followup_task_title IS NOT NULL THEN
    INSERT INTO tasks (
      organization_id,
      customer_id,
      title,
      description,
      status,
      priority,
      due_at,
      owner_member_id
    )
    VALUES (
      p_organization_id,
      p_customer_id,
      p_followup_task_title,
      p_followup_task_description,
      'open',
      p_followup_task_priority,
      p_followup_task_due_at,
      p_followup_task_owner_member_id
    );
  END IF;

  RETURN v_meeting;
END;
$$;
