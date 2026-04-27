import { describe, expect, it } from 'vitest';

import {
  addCustomerToList,
  createCheckedNote,
  createMeetingWithParticipants,
  getTodaySnapshot,
  removeCustomerFromList,
  transitionTaskStatus,
  type Queryable,
} from './peaa5ExecutionFlows';

type MockCall = { text: string; values?: unknown[] };

function createMockDb(rowsQueue: unknown[][]): { db: Queryable; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const db: Queryable = {
    async query(text, values) {
      calls.push({ text, values });
      const rows = rowsQueue.shift() ?? [];
      return { rows: rows as Record<string, unknown>[] };
    },
  };
  return { db, calls };
}

describe('peaa5ExecutionFlows wrappers', () => {
  it('calls get_today_snapshot with expected args', async () => {
    const snapshot = { tasks: [], upcomingMeetings: [], recentCustomers: [], lists: [] };
    const { db, calls } = createMockDb([[{ snapshot }]]);

    const result = await getTodaySnapshot(db, 'org_1', 'member_1', '2026-04-27T00:00:00Z');

    expect(result).toEqual(snapshot);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('get_today_snapshot');
    expect(calls[0]?.values).toEqual(['org_1', 'member_1', '2026-04-27T00:00:00Z']);
  });

  it('calls transition_task_status with task status cast', async () => {
    const row = { id: 'task_1', status: 'done' };
    const { db, calls } = createMockDb([[row]]);

    const result = await transitionTaskStatus(db, 'org_1', 'task_1', 'done');

    expect(result).toEqual(row);
    expect(calls[0]?.text).toContain('transition_task_status');
    expect(calls[0]?.text).toContain('$3::task_status');
    expect(calls[0]?.values).toEqual(['org_1', 'task_1', 'done']);
  });

  it('adds and removes customer list membership', async () => {
    const membership = { id: 'lc_1', list_id: 'list_1', customer_id: 'customer_1' };
    const { db, calls } = createMockDb([
      [membership],
      [{ remove_customer_from_list: true }],
    ]);

    const addResult = await addCustomerToList(db, 'org_1', 'list_1', 'customer_1');
    const removeResult = await removeCustomerFromList(db, 'org_1', 'list_1', 'customer_1');

    expect(addResult).toEqual(membership);
    expect(removeResult).toBe(true);
    expect(calls[0]?.text).toContain('add_customer_to_list');
    expect(calls[1]?.text).toContain('remove_customer_from_list');
  });

  it('calls create_note_checked with nullable link args', async () => {
    const note = { id: 'note_1', title: 'Note 1' };
    const { db, calls } = createMockDb([[note]]);

    const result = await createCheckedNote(db, {
      organizationId: 'org_1',
      customerId: 'customer_1',
      title: 'Note 1',
      body: 'Body',
      authorMemberId: 'member_1',
    });

    expect(result).toEqual(note);
    expect(calls[0]?.text).toContain('create_note_checked');
    expect(calls[0]?.values).toEqual([
      'org_1',
      'customer_1',
      'Note 1',
      'Body',
      'member_1',
      null,
      null,
    ]);
  });

  it('calls create_meeting_with_participants with default/optional args', async () => {
    const meeting = { id: 'meeting_1', title: 'Sync' };
    const { db, calls } = createMockDb([[meeting]]);

    const result = await createMeetingWithParticipants(db, {
      organizationId: 'org_1',
      customerId: 'customer_1',
      title: 'Sync',
      participantIds: ['person_1', 'person_2'],
    });

    expect(result).toEqual(meeting);
    expect(calls[0]?.text).toContain('create_meeting_with_participants');
    expect(calls[0]?.text).toContain('$9::uuid[]');
    expect(calls[0]?.values?.[0]).toBe('org_1');
    expect(calls[0]?.values?.[1]).toBe('customer_1');
    expect(calls[0]?.values?.[2]).toBe('Sync');
    expect(calls[0]?.values?.[8]).toEqual(['person_1', 'person_2']);
    expect(calls[0]?.values?.[13]).toBe('medium');
  });
});
