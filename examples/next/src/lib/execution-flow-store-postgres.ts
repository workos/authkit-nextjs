import {
  addCustomerToList,
  createCheckedNote,
  createMeetingWithParticipants,
  getTodaySnapshot,
  removeCustomerFromList,
  transitionTaskStatus,
  type Queryable,
} from '../../../../packages/db/src';
import type { NoteLinkedObjectType, TaskPriority, TodaySnapshot } from '../../../../packages/domain/src';

let pool: Queryable | null = null;

function getPool(): Queryable {
  if (pool) return pool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for execution-flow Postgres store');
  }

  const { Pool } = require('pg') as {
    Pool: new (options?: { connectionString?: string; max?: number }) => Queryable;
  };

  pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
  });
  return pool;
}

export function isExecutionFlowPostgresEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export interface ExecutionFlowOption {
  id: string;
  label: string;
}

export interface PersonOption extends ExecutionFlowOption {
  customerId: string;
}

export interface ExecutionFlowOptions {
  customers: ExecutionFlowOption[];
  lists: ExecutionFlowOption[];
  people: PersonOption[];
}

export async function getTodaySnapshotForMember(params: {
  organizationId: string;
  memberId: string;
}): Promise<TodaySnapshot> {
  return await getTodaySnapshot(getPool(), params.organizationId, params.memberId);
}

export async function getExecutionFlowOptions(params: { organizationId: string }): Promise<ExecutionFlowOptions> {
  const db = getPool();

  const [customersResult, listsResult, peopleResult] = await Promise.all([
    db.query<{ id: string; name: string }>(
      `
        SELECT c.id, c.name
        FROM customers c
        WHERE c.organization_id = $1
        ORDER BY c.name ASC
      `,
      [params.organizationId]
    ),
    db.query<{ id: string; name: string }>(
      `
        SELECT l.id, l.name
        FROM lists l
        WHERE l.organization_id = $1
        ORDER BY l.name ASC
      `,
      [params.organizationId]
    ),
    db.query<{ id: string; customer_id: string; first_name: string; last_name: string; customer_name: string }>(
      `
        SELECT p.id, p.customer_id, p.first_name, p.last_name, c.name AS customer_name
        FROM people p
        JOIN customers c
          ON c.id = p.customer_id
         AND c.organization_id = p.organization_id
        WHERE p.organization_id = $1
        ORDER BY c.name ASC, p.first_name ASC, p.last_name ASC
      `,
      [params.organizationId]
    ),
  ]);

  return {
    customers: customersResult.rows.map((row) => ({ id: row.id, label: row.name })),
    lists: listsResult.rows.map((row) => ({ id: row.id, label: row.name })),
    people: peopleResult.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      label: `${`${row.first_name} ${row.last_name}`.trim()} (${row.customer_name})`,
    })),
  };
}

export async function markTaskDone(params: {
  organizationId: string;
  taskId: string;
}): Promise<void> {
  await transitionTaskStatus(getPool(), params.organizationId, params.taskId, 'done');
}

export async function addCustomerToListForOrg(params: {
  organizationId: string;
  listId: string;
  customerId: string;
}): Promise<void> {
  await addCustomerToList(getPool(), params.organizationId, params.listId, params.customerId);
}

export async function removeCustomerFromListForOrg(params: {
  organizationId: string;
  listId: string;
  customerId: string;
}): Promise<void> {
  await removeCustomerFromList(getPool(), params.organizationId, params.listId, params.customerId);
}

export async function createNoteForOrg(params: {
  organizationId: string;
  customerId: string;
  title: string;
  body: string;
  authorMemberId: string;
  linkedObjectType?: NoteLinkedObjectType | null;
  linkedObjectId?: string | null;
}): Promise<void> {
  await createCheckedNote(getPool(), {
    organizationId: params.organizationId,
    customerId: params.customerId,
    title: params.title,
    body: params.body,
    authorMemberId: params.authorMemberId,
    linkedObjectType: params.linkedObjectType ?? null,
    linkedObjectId: params.linkedObjectId ?? null,
  });
}

export async function createMeetingForOrg(params: {
  organizationId: string;
  customerId: string;
  title: string;
  meetingUrl?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  summary?: string | null;
  notes?: string | null;
  participantIds?: string[];
  followupTaskTitle?: string | null;
  followupTaskDescription?: string | null;
  followupTaskDueAt?: string | null;
  followupTaskOwnerMemberId?: string | null;
  followupTaskPriority?: TaskPriority;
}): Promise<void> {
  await createMeetingWithParticipants(getPool(), {
    organizationId: params.organizationId,
    customerId: params.customerId,
    title: params.title,
    meetingUrl: params.meetingUrl ?? null,
    scheduledAt: params.scheduledAt ?? null,
    durationMinutes: params.durationMinutes ?? null,
    summary: params.summary ?? null,
    notes: params.notes ?? null,
    participantIds: params.participantIds ?? [],
    followupTaskTitle: params.followupTaskTitle ?? null,
    followupTaskDescription: params.followupTaskDescription ?? null,
    followupTaskDueAt: params.followupTaskDueAt ?? null,
    followupTaskOwnerMemberId: params.followupTaskOwnerMemberId ?? null,
    followupTaskPriority: params.followupTaskPriority ?? 'medium',
  });
}
