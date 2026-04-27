import type {
  CreateCheckedNoteInput,
  CreateMeetingWithParticipantsInput,
  NoteLinkedObjectType,
  TaskStatus,
  TodaySnapshot,
} from '../../domain/src/execution-flows';

type QueryRow = Record<string, unknown>;

type QueryResult<T extends QueryRow = QueryRow> = {
  rows: T[];
  rowCount?: number | null;
};

export type Queryable = {
  query<T extends QueryRow = QueryRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
};

type SnapshotRow = {
  snapshot: TodaySnapshot;
};

type TaskRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
  due_at: string | null;
  owner_member_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type ListMembershipRow = {
  id: string;
  organization_id: string;
  list_id: string;
  customer_id: string;
  created_at: string;
};

type NoteRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  title: string;
  body: string;
  author_member_id: string | null;
  linked_object_type: NoteLinkedObjectType | null;
  linked_object_id: string | null;
  created_at: string;
  updated_at: string;
};

type MeetingRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  title: string;
  meeting_url: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  summary: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function queryOne<T extends QueryRow>(db: Queryable, sql: string, values: unknown[]): Promise<T> {
  const result = await db.query<T>(sql, values);
  const row = result.rows[0];
  if (!row) {
    throw new Error('Expected one row but query returned no rows');
  }
  return row;
}

export async function getTodaySnapshot(
  db: Queryable,
  organizationId: string,
  memberId: string,
  nowIso?: string
): Promise<TodaySnapshot> {
  const row = await queryOne<SnapshotRow>(
    db,
    'SELECT get_today_snapshot($1, $2, $3::timestamptz) AS snapshot',
    [organizationId, memberId, nowIso ?? new Date().toISOString()]
  );
  return row.snapshot;
}

export async function transitionTaskStatus(
  db: Queryable,
  organizationId: string,
  taskId: string,
  nextStatus: TaskStatus
): Promise<TaskRow> {
  return queryOne<TaskRow>(
    db,
    'SELECT * FROM transition_task_status($1, $2::uuid, $3::task_status)',
    [organizationId, taskId, nextStatus]
  );
}

export async function addCustomerToList(
  db: Queryable,
  organizationId: string,
  listId: string,
  customerId: string
): Promise<ListMembershipRow> {
  return queryOne<ListMembershipRow>(
    db,
    'SELECT * FROM add_customer_to_list($1, $2::uuid, $3::uuid)',
    [organizationId, listId, customerId]
  );
}

export async function removeCustomerFromList(
  db: Queryable,
  organizationId: string,
  listId: string,
  customerId: string
): Promise<boolean> {
  const row = await queryOne<{ remove_customer_from_list: boolean }>(
    db,
    'SELECT remove_customer_from_list($1, $2::uuid, $3::uuid)',
    [organizationId, listId, customerId]
  );
  return row.remove_customer_from_list;
}

export async function createCheckedNote(db: Queryable, input: CreateCheckedNoteInput): Promise<NoteRow> {
  return queryOne<NoteRow>(
    db,
    [
      'SELECT * FROM create_note_checked(',
      '  $1,',
      '  $2::uuid,',
      '  $3,',
      '  $4,',
      '  $5::uuid,',
      '  $6::note_linked_object_type,',
      '  $7::uuid',
      ')',
    ].join('\n'),
    [
      input.organizationId,
      input.customerId,
      input.title,
      input.body,
      input.authorMemberId,
      input.linkedObjectType ?? null,
      input.linkedObjectId ?? null,
    ]
  );
}

export async function createMeetingWithParticipants(
  db: Queryable,
  input: CreateMeetingWithParticipantsInput
): Promise<MeetingRow> {
  return queryOne<MeetingRow>(
    db,
    [
      'SELECT * FROM create_meeting_with_participants(',
      '  $1,',
      '  $2::uuid,',
      '  $3,',
      '  $4,',
      '  $5::timestamptz,',
      '  $6::integer,',
      '  $7,',
      '  $8,',
      '  $9::uuid[],',
      '  $10,',
      '  $11,',
      '  $12::timestamptz,',
      '  $13::uuid,',
      '  $14::task_priority',
      ')',
    ].join('\n'),
    [
      input.organizationId,
      input.customerId,
      input.title,
      input.meetingUrl ?? null,
      input.scheduledAt ?? new Date().toISOString(),
      input.durationMinutes ?? null,
      input.summary ?? null,
      input.notes ?? null,
      input.participantIds ?? [],
      input.followupTaskTitle ?? null,
      input.followupTaskDescription ?? null,
      input.followupTaskDueAt ?? null,
      input.followupTaskOwnerMemberId ?? null,
      input.followupTaskPriority ?? 'medium',
    ]
  );
}
