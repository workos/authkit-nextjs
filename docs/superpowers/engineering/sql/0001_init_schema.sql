CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE member_role AS ENUM ('admin', 'manager', 'csm', 'am', 'viewer');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_lifecycle_stage') THEN
    CREATE TYPE customer_lifecycle_stage AS ENUM ('onboarding', 'active', 'renewal', 'at_risk', 'churned');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_status') THEN
    CREATE TYPE record_status AS ENUM ('active', 'inactive');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'person_role') THEN
    CREATE TYPE person_role AS ENUM ('champion', 'admin', 'executive_sponsor', 'buyer', 'end_user', 'blocker', 'unknown');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_status') THEN
    CREATE TYPE relationship_status AS ENUM ('strong', 'neutral', 'weak', 'unknown');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'done', 'canceled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'note_linked_object_type') THEN
    CREATE TYPE note_linked_object_type AS ENUM ('customer', 'person', 'meeting', 'task');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'list_object_type') THEN
    CREATE TYPE list_object_type AS ENUM ('customer');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  workos_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role member_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  website TEXT,
  lifecycle_stage customer_lifecycle_stage NOT NULL DEFAULT 'active',
  status record_status NOT NULL DEFAULT 'active',
  owner_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  customer_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  role person_role NOT NULL DEFAULT 'unknown',
  relationship_status relationship_status NOT NULL DEFAULT 'unknown',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  CONSTRAINT people_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  customer_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'open',
  priority task_priority NOT NULL DEFAULT 'medium',
  due_at TIMESTAMPTZ,
  owner_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT tasks_completed_at_check CHECK (
    (status = 'done' AND completed_at IS NOT NULL)
    OR (status <> 'done' AND completed_at IS NULL)
  ),
  UNIQUE (id, organization_id),
  CONSTRAINT tasks_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  customer_id UUID NOT NULL,
  title TEXT NOT NULL,
  meeting_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  summary TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meetings_duration_check CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  UNIQUE (id, organization_id),
  CONSTRAINT meetings_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  meeting_id UUID NOT NULL,
  person_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, person_id),
  CONSTRAINT meeting_participants_meeting_fk
    FOREIGN KEY (meeting_id, organization_id)
    REFERENCES meetings(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT meeting_participants_person_fk
    FOREIGN KEY (person_id, organization_id)
    REFERENCES people(id, organization_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  customer_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  linked_object_type note_linked_object_type,
  linked_object_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notes_link_pair_check CHECK (
    (linked_object_type IS NULL AND linked_object_id IS NULL)
    OR (linked_object_type IS NOT NULL AND linked_object_id IS NOT NULL)
  ),
  CONSTRAINT notes_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  object_type list_object_type NOT NULL DEFAULT 'customer',
  created_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS list_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  list_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (list_id, customer_id),
  CONSTRAINT list_customers_list_fk
    FOREIGN KEY (list_id, organization_id)
    REFERENCES lists(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT list_customers_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION ensure_member_org_match(
  p_organization_id TEXT,
  p_member_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM members m
    WHERE m.id = p_member_id
      AND m.organization_id = p_organization_id
  );
$$;

CREATE OR REPLACE FUNCTION enforce_customer_member_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_member_id IS NOT NULL
    AND NOT ensure_member_org_match(NEW.organization_id, NEW.owner_member_id) THEN
    RAISE EXCEPTION 'customer owner member must belong to same organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_task_member_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_member_id IS NOT NULL
    AND NOT ensure_member_org_match(NEW.organization_id, NEW.owner_member_id) THEN
    RAISE EXCEPTION 'task owner member must belong to same organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_note_author_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.author_member_id IS NOT NULL
    AND NOT ensure_member_org_match(NEW.organization_id, NEW.author_member_id) THEN
    RAISE EXCEPTION 'note author member must belong to same organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_list_creator_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by_member_id IS NOT NULL
    AND NOT ensure_member_org_match(NEW.organization_id, NEW.created_by_member_id) THEN
    RAISE EXCEPTION 'list creator member must belong to same organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_note_link_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NEW.linked_object_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.linked_object_type = 'customer' THEN
    SELECT EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.id = NEW.linked_object_id
        AND c.organization_id = NEW.organization_id
        AND c.id = NEW.customer_id
    ) INTO v_exists;
  ELSIF NEW.linked_object_type = 'person' THEN
    SELECT EXISTS (
      SELECT 1
      FROM people p
      WHERE p.id = NEW.linked_object_id
        AND p.organization_id = NEW.organization_id
        AND p.customer_id = NEW.customer_id
    ) INTO v_exists;
  ELSIF NEW.linked_object_type = 'meeting' THEN
    SELECT EXISTS (
      SELECT 1
      FROM meetings m
      WHERE m.id = NEW.linked_object_id
        AND m.organization_id = NEW.organization_id
        AND m.customer_id = NEW.customer_id
    ) INTO v_exists;
  ELSIF NEW.linked_object_type = 'task' THEN
    SELECT EXISTS (
      SELECT 1
      FROM tasks t
      WHERE t.id = NEW.linked_object_id
        AND t.organization_id = NEW.organization_id
        AND t.customer_id = NEW.customer_id
    ) INTO v_exists;
  ELSE
    v_exists := FALSE;
  END IF;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'note linked object must exist in same organization and customer scope';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_member_org_guard ON customers;
CREATE TRIGGER customers_member_org_guard
  BEFORE INSERT OR UPDATE OF organization_id, owner_member_id
  ON customers
  FOR EACH ROW
  EXECUTE FUNCTION enforce_customer_member_org();

DROP TRIGGER IF EXISTS tasks_member_org_guard ON tasks;
CREATE TRIGGER tasks_member_org_guard
  BEFORE INSERT OR UPDATE OF organization_id, owner_member_id
  ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_task_member_org();

DROP TRIGGER IF EXISTS notes_author_org_guard ON notes;
CREATE TRIGGER notes_author_org_guard
  BEFORE INSERT OR UPDATE OF organization_id, author_member_id
  ON notes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_note_author_org();

DROP TRIGGER IF EXISTS lists_creator_org_guard ON lists;
CREATE TRIGGER lists_creator_org_guard
  BEFORE INSERT OR UPDATE OF organization_id, created_by_member_id
  ON lists
  FOR EACH ROW
  EXECUTE FUNCTION enforce_list_creator_org();

DROP TRIGGER IF EXISTS notes_link_target_guard ON notes;
CREATE TRIGGER notes_link_target_guard
  BEFORE INSERT OR UPDATE OF organization_id, customer_id, linked_object_type, linked_object_id
  ON notes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_note_link_target();
