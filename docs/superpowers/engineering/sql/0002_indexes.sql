CREATE UNIQUE INDEX IF NOT EXISTS members_org_workos_user_uidx
  ON members (organization_id, workos_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS members_org_email_uidx
  ON members (organization_id, lower(email));

CREATE INDEX IF NOT EXISTS customers_org_updated_idx
  ON customers (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS customers_org_owner_idx
  ON customers (organization_id, owner_member_id);

CREATE UNIQUE INDEX IF NOT EXISTS customers_org_name_uidx
  ON customers (organization_id, lower(name));

CREATE INDEX IF NOT EXISTS people_org_customer_idx
  ON people (organization_id, customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS people_org_email_uidx
  ON people (organization_id, lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_org_due_idx
  ON tasks (organization_id, due_at ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS tasks_org_customer_idx
  ON tasks (organization_id, customer_id);

CREATE INDEX IF NOT EXISTS tasks_org_owner_status_idx
  ON tasks (organization_id, owner_member_id, status);

CREATE INDEX IF NOT EXISTS tasks_org_open_due_idx
  ON tasks (organization_id, due_at ASC NULLS LAST)
  WHERE status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS meetings_org_scheduled_idx
  ON meetings (organization_id, scheduled_at ASC);

CREATE INDEX IF NOT EXISTS meetings_org_customer_idx
  ON meetings (organization_id, customer_id);

CREATE INDEX IF NOT EXISTS meeting_participants_org_meeting_idx
  ON meeting_participants (organization_id, meeting_id);

CREATE INDEX IF NOT EXISTS meeting_participants_org_person_idx
  ON meeting_participants (organization_id, person_id);

CREATE INDEX IF NOT EXISTS notes_org_customer_updated_idx
  ON notes (organization_id, customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS notes_org_author_idx
  ON notes (organization_id, author_member_id);

CREATE INDEX IF NOT EXISTS notes_org_linked_idx
  ON notes (organization_id, linked_object_type, linked_object_id);

CREATE UNIQUE INDEX IF NOT EXISTS lists_org_name_uidx
  ON lists (organization_id, lower(name));

CREATE INDEX IF NOT EXISTS list_customers_org_list_idx
  ON list_customers (organization_id, list_id);

CREATE INDEX IF NOT EXISTS list_customers_org_customer_idx
  ON list_customers (organization_id, customer_id);
