-- Verification queries for PEAA-2 schema + seed.
-- Read-only checks for Today and customer-detail prerequisites.

BEGIN;

-- Seed cardinality checks.
SELECT
  (SELECT COUNT(*) FROM members WHERE organization_id = 'org_seed_peazy_v1') AS members_count,
  (SELECT COUNT(*) FROM customers WHERE organization_id = 'org_seed_peazy_v1') AS customers_count,
  (SELECT COUNT(*) FROM people WHERE organization_id = 'org_seed_peazy_v1') AS people_count,
  (SELECT COUNT(*) FROM tasks WHERE organization_id = 'org_seed_peazy_v1') AS tasks_count,
  (SELECT COUNT(*) FROM meetings WHERE organization_id = 'org_seed_peazy_v1') AS meetings_count,
  (SELECT COUNT(*) FROM notes WHERE organization_id = 'org_seed_peazy_v1') AS notes_count,
  (SELECT COUNT(*) FROM lists WHERE organization_id = 'org_seed_peazy_v1') AS lists_count;

-- Today query readiness: overdue + due-today tasks.
SELECT
  COUNT(*) FILTER (WHERE t.status IN ('open', 'in_progress') AND t.due_at < NOW()) AS overdue_open_tasks,
  COUNT(*) FILTER (
    WHERE t.status IN ('open', 'in_progress')
      AND t.due_at >= date_trunc('day', NOW())
      AND t.due_at < date_trunc('day', NOW()) + INTERVAL '1 day'
  ) AS due_today_open_tasks
FROM tasks t
WHERE t.organization_id = 'org_seed_peazy_v1';

-- Customer-detail graph readiness (active customers only).
SELECT
  c.id AS customer_id,
  c.name,
  COUNT(DISTINCT p.id) AS people_count,
  COUNT(DISTINCT t.id) AS tasks_count,
  COUNT(DISTINCT m.id) AS meetings_count,
  COUNT(DISTINCT n.id) AS notes_count,
  COUNT(DISTINCT lc.id) AS list_memberships_count
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
LEFT JOIN list_customers lc
  ON lc.customer_id = c.id
  AND lc.organization_id = c.organization_id
WHERE c.organization_id = 'org_seed_peazy_v1'
  AND c.status = 'active'
GROUP BY c.id, c.name
ORDER BY c.name;

ROLLBACK;
