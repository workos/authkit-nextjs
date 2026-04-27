-- PEAA-5 Today snapshot composer.
-- Returns a single JSON payload for server-side Today page reads.

CREATE OR REPLACE FUNCTION get_today_snapshot(
  p_organization_id TEXT,
  p_member_id UUID,
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_limit_tasks INTEGER DEFAULT 50,
  p_limit_meetings INTEGER DEFAULT 10,
  p_limit_customers INTEGER DEFAULT 10,
  p_limit_lists INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'tasks',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'taskId', t.task_id,
            'customerId', t.customer_id,
            'title', t.title,
            'status', t.status,
            'priority', t.priority,
            'dueAt', t.due_at,
            'sortBucket', t.sort_bucket
          )
          ORDER BY t.sort_bucket ASC, t.due_at ASC NULLS LAST
        )
        FROM (
          SELECT *
          FROM get_today_tasks(p_organization_id, p_member_id, p_now)
          LIMIT p_limit_tasks
        ) t
      ),
      '[]'::jsonb
    ),
    'upcomingMeetings',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'meetingId', m.meeting_id,
            'customerId', m.customer_id,
            'title', m.title,
            'scheduledAt', m.scheduled_at
          )
          ORDER BY m.scheduled_at ASC
        )
        FROM get_today_upcoming_meetings(p_organization_id, p_now, p_limit_meetings) m
      ),
      '[]'::jsonb
    ),
    'recentCustomers',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'customerId', c.customer_id,
            'name', c.name,
            'lifecycleStage', c.lifecycle_stage,
            'status', c.status,
            'updatedAt', c.updated_at
          )
          ORDER BY c.updated_at DESC
        )
        FROM get_today_recent_customers(p_organization_id, p_limit_customers) c
      ),
      '[]'::jsonb
    ),
    'lists',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'listId', l.id,
            'name', l.name,
            'description', l.description,
            'updatedAt', l.updated_at
          )
          ORDER BY l.updated_at DESC
        )
        FROM (
          SELECT l.id, l.name, l.description, l.updated_at
          FROM lists l
          WHERE l.organization_id = p_organization_id
            AND (
              l.created_by_member_id = p_member_id
              OR EXISTS (
                SELECT 1
                FROM list_customers lc
                JOIN customers c
                  ON c.id = lc.customer_id
                 AND c.organization_id = p_organization_id
                WHERE lc.organization_id = p_organization_id
                  AND lc.list_id = l.id
                  AND c.owner_member_id = p_member_id
              )
            )
          ORDER BY l.updated_at DESC
          LIMIT p_limit_lists
        ) l
      ),
      '[]'::jsonb
    )
  );
$$;
