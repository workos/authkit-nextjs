BEGIN;

-- Deterministic org-scoped seed for Peazy V1 execution flows.
-- Safe to rerun: clears this seed org first, then recreates.

DELETE FROM list_customers WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM meeting_participants WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM notes WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM meetings WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM tasks WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM people WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM lists WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM customers WHERE organization_id = 'org_seed_peazy_v1';
DELETE FROM members WHERE organization_id = 'org_seed_peazy_v1';

INSERT INTO members (id, organization_id, workos_user_id, email, name, role)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'org_seed_peazy_v1', 'wos_seed_001', 'alex.admin@peazy.test', 'Alex Admin', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'org_seed_peazy_v1', 'wos_seed_002', 'maya.manager@peazy.test', 'Maya Manager', 'manager'),
  ('10000000-0000-4000-8000-000000000003', 'org_seed_peazy_v1', 'wos_seed_003', 'chris.csm@peazy.test', 'Chris CSM', 'csm'),
  ('10000000-0000-4000-8000-000000000004', 'org_seed_peazy_v1', 'wos_seed_004', 'taylor.am@peazy.test', 'Taylor AM', 'am');

INSERT INTO customers (
  id,
  organization_id,
  name,
  website,
  lifecycle_stage,
  status,
  owner_member_id,
  description
)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'org_seed_peazy_v1', 'Northstar Health', 'northstarhealth.example', 'onboarding', 'active', '10000000-0000-4000-8000-000000000003', 'Early onboarding with implementation risks'),
  ('20000000-0000-4000-8000-000000000002', 'org_seed_peazy_v1', 'Apex Logistics', 'apexlogistics.example', 'active', 'active', '10000000-0000-4000-8000-000000000004', 'Stable usage with expansion potential'),
  ('20000000-0000-4000-8000-000000000003', 'org_seed_peazy_v1', 'Brightline Labs', 'brightlinelabs.example', 'renewal', 'active', '10000000-0000-4000-8000-000000000003', 'Renewal in current quarter'),
  ('20000000-0000-4000-8000-000000000004', 'org_seed_peazy_v1', 'Summit Retail', 'summitretail.example', 'at_risk', 'active', '10000000-0000-4000-8000-000000000003', 'Adoption drop in two regions'),
  ('20000000-0000-4000-8000-000000000005', 'org_seed_peazy_v1', 'Helios Manufacturing', 'heliosmfg.example', 'active', 'active', '10000000-0000-4000-8000-000000000004', 'Operational stakeholder turnover'),
  ('20000000-0000-4000-8000-000000000006', 'org_seed_peazy_v1', 'Orbit Education', 'orbitedu.example', 'onboarding', 'active', '10000000-0000-4000-8000-000000000004', 'New rollout to five campuses'),
  ('20000000-0000-4000-8000-000000000007', 'org_seed_peazy_v1', 'Cinder Energy', 'cinderenergy.example', 'renewal', 'active', '10000000-0000-4000-8000-000000000003', 'Commercial review pending'),
  ('20000000-0000-4000-8000-000000000008', 'org_seed_peazy_v1', 'Verdant Foods', 'verdantfoods.example', 'active', 'inactive', '10000000-0000-4000-8000-000000000004', 'Temporarily inactive pilot account');

INSERT INTO people (
  id,
  organization_id,
  customer_id,
  first_name,
  last_name,
  email,
  phone,
  title,
  role,
  relationship_status,
  notes
)
SELECT
  gen_random_uuid(),
  'org_seed_peazy_v1',
  c.id,
  p.first_name,
  c.name,
  lower(replace(c.name, ' ', '')) || '+' || p.email_suffix || '@example.com',
  '+1-555-01' || p.phone_suffix,
  t.title,
  p.role::person_role,
  p.relationship_status::relationship_status,
  p.notes
FROM customers c
JOIN LATERAL (
  VALUES
    ('Jordan', 'champion', 'champion', 'strong', 'Primary champion for rollout', '01', 'jordan'),
    ('Riley', 'admin', 'admin', 'neutral', 'Platform administrator and security reviewer', '02', 'riley'),
    ('Avery', 'sponsor', 'executive_sponsor', 'weak', 'Quarterly sponsor contact', '03', 'avery')
) AS p(first_name, email_suffix, role, relationship_status, notes, phone_suffix, title_word) ON TRUE
CROSS JOIN LATERAL (
  VALUES
    (INITCAP(p.title_word) || ' Lead')
) AS t(title);

INSERT INTO tasks (
  id,
  organization_id,
  customer_id,
  title,
  description,
  status,
  priority,
  due_at,
  owner_member_id,
  completed_at
)
SELECT
  gen_random_uuid(),
  'org_seed_peazy_v1',
  c.id,
  task_def.title,
  task_def.description,
  task_def.status::task_status,
  task_def.priority::task_priority,
  task_def.due_at,
  CASE
    WHEN row_number() OVER (ORDER BY c.id) % 2 = 0 THEN '10000000-0000-4000-8000-000000000004'::uuid
    ELSE '10000000-0000-4000-8000-000000000003'::uuid
  END,
  CASE
    WHEN task_def.status = 'done' THEN NOW() - INTERVAL '1 day'
    ELSE NULL
  END
FROM customers c
JOIN LATERAL (
  VALUES
    ('Kickoff follow-up', 'Confirm kickoff decisions and owners', 'open', 'high', NOW() - INTERVAL '2 days'),
    ('Usage review prep', 'Compile adoption trends and blockers', 'in_progress', 'medium', NOW()),
    ('Stakeholder recap', 'Share weekly update notes', 'done', 'medium', NOW() - INTERVAL '5 days'),
    ('Renewal risk check', 'Validate renewal dependencies', 'open', 'high', NOW() + INTERVAL '3 days')
) AS task_def(title, description, status, priority, due_at) ON TRUE;

INSERT INTO meetings (
  id,
  organization_id,
  customer_id,
  title,
  meeting_url,
  scheduled_at,
  duration_minutes,
  summary,
  notes
)
SELECT
  gen_random_uuid(),
  'org_seed_peazy_v1',
  c.id,
  meeting_def.title,
  'https://meet.example.com/' || lower(replace(c.name, ' ', '-')) || '-' || meeting_def.slug,
  meeting_def.scheduled_at,
  meeting_def.duration_minutes,
  meeting_def.summary,
  meeting_def.notes
FROM customers c
JOIN LATERAL (
  VALUES
    ('Weekly sync', 'weekly', NOW() + INTERVAL '1 day', 30, 'Weekly execution check-in', 'Track open work and owners'),
    ('Executive review', 'exec', NOW() + INTERVAL '4 days', 45, 'Business review and risks', 'Confirm commercial and adoption updates')
) AS meeting_def(title, slug, scheduled_at, duration_minutes, summary, notes) ON TRUE
;

WITH ranked_people AS (
  SELECT
    p.id,
    p.customer_id,
    ROW_NUMBER() OVER (PARTITION BY p.customer_id ORDER BY p.email) AS person_rank
  FROM people p
  WHERE p.organization_id = 'org_seed_peazy_v1'
),
ranked_meetings AS (
  SELECT
    m.id,
    m.customer_id
  FROM meetings m
  WHERE m.organization_id = 'org_seed_peazy_v1'
)
INSERT INTO meeting_participants (id, organization_id, meeting_id, person_id)
SELECT
  gen_random_uuid(),
  'org_seed_peazy_v1',
  m.id,
  p.id
FROM ranked_meetings m
JOIN ranked_people p
  ON p.customer_id = m.customer_id
WHERE p.person_rank <= 2;

INSERT INTO notes (
  id,
  organization_id,
  customer_id,
  title,
  body,
  author_member_id,
  linked_object_type,
  linked_object_id
)
SELECT
  gen_random_uuid(),
  'org_seed_peazy_v1',
  c.id,
  note_def.title,
  note_def.body,
  CASE
    WHEN row_number() OVER (ORDER BY c.id) % 2 = 0 THEN '10000000-0000-4000-8000-000000000004'::uuid
    ELSE '10000000-0000-4000-8000-000000000003'::uuid
  END,
  note_def.linked_object_type::note_linked_object_type,
  note_def.linked_object_id
FROM customers c
JOIN LATERAL (
  SELECT
    'Account context'::text AS title,
    'Customer context and latest internal summary.'::text AS body,
    'customer'::text AS linked_object_type,
    c.id::uuid AS linked_object_id
  UNION ALL
  SELECT
    'Stakeholder signal',
    'Relationship health update for primary champion.',
    'person',
    (
      SELECT p.id
      FROM people p
      WHERE p.organization_id = 'org_seed_peazy_v1' AND p.customer_id = c.id
      ORDER BY p.email
      LIMIT 1
    )
  UNION ALL
  SELECT
    'Meeting follow-up',
    'Action items captured from latest customer meeting.',
    'meeting',
    (
      SELECT m.id
      FROM meetings m
      WHERE m.organization_id = 'org_seed_peazy_v1' AND m.customer_id = c.id
      ORDER BY m.scheduled_at
      LIMIT 1
    )
  UNION ALL
  SELECT
    'Task context',
    'Detailed context for active execution task.',
    'task',
    (
      SELECT t.id
      FROM tasks t
      WHERE t.organization_id = 'org_seed_peazy_v1' AND t.customer_id = c.id
      ORDER BY t.created_at
      LIMIT 1
    )
) AS note_def ON TRUE;

INSERT INTO lists (
  id,
  organization_id,
  name,
  description,
  object_type,
  created_by_member_id
)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'org_seed_peazy_v1', 'Renewing this quarter', 'Customers with near-term commercial events', 'customer', '10000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000002', 'org_seed_peazy_v1', 'Needs attention', 'Accounts with delivery or adoption risk', 'customer', '10000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000003', 'org_seed_peazy_v1', 'Onboarding', 'Newly launched customers', 'customer', '10000000-0000-4000-8000-000000000004'),
  ('30000000-0000-4000-8000-000000000004', 'org_seed_peazy_v1', 'My book of business', 'Primary CSM-owned customer set', 'customer', '10000000-0000-4000-8000-000000000003');

INSERT INTO list_customers (id, organization_id, list_id, customer_id)
VALUES
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000007'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000006'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004'),
  (gen_random_uuid(), 'org_seed_peazy_v1', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000007');

COMMIT;
