-- PEAA-10 customer/person surface SQL primitives.
-- Organization scope is enforced on every function.

CREATE OR REPLACE FUNCTION get_customers_with_metrics(
  p_organization_id TEXT,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  customer_id UUID,
  name TEXT,
  lifecycle_stage customer_lifecycle_stage,
  status record_status,
  owner_member_id UUID,
  open_tasks_count BIGINT,
  upcoming_meeting_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  WITH base AS (
    SELECT c.*
    FROM customers c
    WHERE c.organization_id = p_organization_id
      AND (
        p_search IS NULL
        OR p_search = ''
        OR c.name ILIKE '%' || p_search || '%'
      )
    ORDER BY c.updated_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    c.id AS customer_id,
    c.name,
    c.lifecycle_stage,
    c.status,
    c.owner_member_id,
    COALESCE(
      (
        SELECT COUNT(*)
        FROM tasks t
        WHERE t.organization_id = p_organization_id
          AND t.customer_id = c.id
          AND t.status IN ('open', 'in_progress')
      ),
      0
    ) AS open_tasks_count,
    (
      SELECT MIN(m.scheduled_at)
      FROM meetings m
      WHERE m.organization_id = p_organization_id
        AND m.customer_id = c.id
        AND m.scheduled_at >= NOW()
    ) AS upcoming_meeting_at,
    c.updated_at
  FROM base c
  ORDER BY c.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_customer_detail_bundle(
  p_organization_id TEXT,
  p_customer_id UUID
)
RETURNS TABLE (
  customer_id UUID,
  name TEXT,
  website TEXT,
  lifecycle_stage customer_lifecycle_stage,
  status record_status,
  owner_member_id UUID,
  description TEXT,
  people_count BIGINT,
  open_tasks_count BIGINT,
  upcoming_meetings_count BIGINT,
  notes_count BIGINT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  SELECT
    c.id AS customer_id,
    c.name,
    c.website,
    c.lifecycle_stage,
    c.status,
    c.owner_member_id,
    c.description,
    (
      SELECT COUNT(*)
      FROM people p
      WHERE p.organization_id = p_organization_id
        AND p.customer_id = c.id
    ) AS people_count,
    (
      SELECT COUNT(*)
      FROM tasks t
      WHERE t.organization_id = p_organization_id
        AND t.customer_id = c.id
        AND t.status IN ('open', 'in_progress')
    ) AS open_tasks_count,
    (
      SELECT COUNT(*)
      FROM meetings m
      WHERE m.organization_id = p_organization_id
        AND m.customer_id = c.id
        AND m.scheduled_at >= NOW()
    ) AS upcoming_meetings_count,
    (
      SELECT COUNT(*)
      FROM notes n
      WHERE n.organization_id = p_organization_id
        AND n.customer_id = c.id
    ) AS notes_count,
    c.updated_at
  FROM customers c
  WHERE c.organization_id = p_organization_id
    AND c.id = p_customer_id;
$$;

CREATE OR REPLACE FUNCTION get_customer_people(
  p_organization_id TEXT,
  p_customer_id UUID
)
RETURNS SETOF people
LANGUAGE sql
AS $$
  SELECT p.*
  FROM people p
  WHERE p.organization_id = p_organization_id
    AND p.customer_id = p_customer_id
  ORDER BY p.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION create_customer_record(
  p_organization_id TEXT,
  p_name TEXT,
  p_owner_member_id UUID DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_lifecycle_stage customer_lifecycle_stage DEFAULT 'active',
  p_status record_status DEFAULT 'active',
  p_description TEXT DEFAULT NULL
)
RETURNS customers
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer customers%ROWTYPE;
BEGIN
  IF p_owner_member_id IS NOT NULL
    AND NOT ensure_member_org_match(p_organization_id, p_owner_member_id) THEN
    RAISE EXCEPTION 'owner member must belong to same organization';
  END IF;

  INSERT INTO customers (
    organization_id,
    name,
    website,
    lifecycle_stage,
    status,
    owner_member_id,
    description,
    created_at,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_name,
    p_website,
    p_lifecycle_stage,
    p_status,
    p_owner_member_id,
    p_description,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_customer;

  RETURN v_customer;
END;
$$;

CREATE OR REPLACE FUNCTION update_customer_record(
  p_organization_id TEXT,
  p_customer_id UUID,
  p_name TEXT,
  p_owner_member_id UUID DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_lifecycle_stage customer_lifecycle_stage DEFAULT 'active',
  p_status record_status DEFAULT 'active',
  p_description TEXT DEFAULT NULL
)
RETURNS customers
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer customers%ROWTYPE;
BEGIN
  IF p_owner_member_id IS NOT NULL
    AND NOT ensure_member_org_match(p_organization_id, p_owner_member_id) THEN
    RAISE EXCEPTION 'owner member must belong to same organization';
  END IF;

  UPDATE customers
  SET
    name = p_name,
    website = p_website,
    lifecycle_stage = p_lifecycle_stage,
    status = p_status,
    owner_member_id = p_owner_member_id,
    description = p_description,
    updated_at = NOW()
  WHERE id = p_customer_id
    AND organization_id = p_organization_id
  RETURNING * INTO v_customer;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found for organization';
  END IF;

  RETURN v_customer;
END;
$$;

CREATE OR REPLACE FUNCTION delete_customer_record(
  p_organization_id TEXT,
  p_customer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM customers
  WHERE id = p_customer_id
    AND organization_id = p_organization_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION create_person_record(
  p_organization_id TEXT,
  p_customer_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_role person_role DEFAULT 'unknown',
  p_relationship_status relationship_status DEFAULT 'unknown',
  p_notes TEXT DEFAULT NULL
)
RETURNS people
LANGUAGE plpgsql
AS $$
DECLARE
  v_person people%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'customer not found for organization';
  END IF;

  INSERT INTO people (
    organization_id,
    customer_id,
    first_name,
    last_name,
    email,
    phone,
    title,
    role,
    relationship_status,
    notes,
    created_at,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_customer_id,
    p_first_name,
    p_last_name,
    p_email,
    p_phone,
    p_title,
    p_role,
    p_relationship_status,
    p_notes,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_person;

  RETURN v_person;
END;
$$;

CREATE OR REPLACE FUNCTION update_person_record(
  p_organization_id TEXT,
  p_person_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_role person_role DEFAULT 'unknown',
  p_relationship_status relationship_status DEFAULT 'unknown',
  p_notes TEXT DEFAULT NULL
)
RETURNS people
LANGUAGE plpgsql
AS $$
DECLARE
  v_person people%ROWTYPE;
BEGIN
  UPDATE people
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    email = p_email,
    phone = p_phone,
    title = p_title,
    role = p_role,
    relationship_status = p_relationship_status,
    notes = p_notes,
    updated_at = NOW()
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  RETURNING * INTO v_person;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'person not found for organization';
  END IF;

  RETURN v_person;
END;
$$;

CREATE OR REPLACE FUNCTION delete_person_record(
  p_organization_id TEXT,
  p_person_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM people
  WHERE id = p_person_id
    AND organization_id = p_organization_id;

  RETURN FOUND;
END;
$$;
