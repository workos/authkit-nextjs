'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMemberContext } from '@/lib/auth-context';
import {
  addCustomerToListForOrg,
  createMeetingForOrg,
  createNoteForOrg,
  markTaskDone,
  removeCustomerFromListForOrg,
} from '@/lib/execution-flow-store-postgres';

function asString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

type TodayActionKey = 'mark_task_done' | 'add_customer_to_list' | 'remove_customer_from_list' | 'create_note' | 'create_meeting';

function toTodayUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `/today?${searchParams.toString()}`;
}

function redirectSuccess(action: TodayActionKey): never {
  redirect(toTodayUrl({ status: 'success', action }));
}

function redirectError(action: TodayActionKey, reason = 'operation_failed'): never {
  redirect(toTodayUrl({ status: 'error', action, reason }));
}

export async function markTaskDoneAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const taskId = asString(formData.get('taskId'));
  if (!taskId) {
    redirectError('mark_task_done', 'missing_task_id');
  }

  try {
    await markTaskDone({
      organizationId: context.organizationId,
      taskId,
    });
  } catch {
    redirectError('mark_task_done');
  }

  revalidatePath('/today');
  redirectSuccess('mark_task_done');
}

export async function addCustomerToListAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const listId = asString(formData.get('listId'));
  const customerId = asString(formData.get('customerId'));
  if (!listId || !customerId) {
    redirectError('add_customer_to_list', 'missing_list_or_customer');
  }

  try {
    await addCustomerToListForOrg({
      organizationId: context.organizationId,
      listId,
      customerId,
    });
  } catch {
    redirectError('add_customer_to_list');
  }

  revalidatePath('/today');
  redirectSuccess('add_customer_to_list');
}

export async function removeCustomerFromListAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const listId = asString(formData.get('listId'));
  const customerId = asString(formData.get('customerId'));
  if (!listId || !customerId) {
    redirectError('remove_customer_from_list', 'missing_list_or_customer');
  }

  try {
    await removeCustomerFromListForOrg({
      organizationId: context.organizationId,
      listId,
      customerId,
    });
  } catch {
    redirectError('remove_customer_from_list');
  }

  revalidatePath('/today');
  redirectSuccess('remove_customer_from_list');
}

export async function createNoteAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const customerId = asString(formData.get('customerId'));
  const title = asString(formData.get('title'));
  const body = asString(formData.get('body'));
  if (!customerId || !title || !body) {
    redirectError('create_note', 'missing_required_fields');
  }

  try {
    await createNoteForOrg({
      organizationId: context.organizationId,
      customerId,
      title,
      body,
      authorMemberId: context.memberId,
    });
  } catch {
    redirectError('create_note');
  }

  revalidatePath('/today');
  redirectSuccess('create_note');
}

function asOptional(value: FormDataEntryValue | null): string | null {
  const next = asString(value).trim();
  return next ? next : null;
}

function asOptionalInt(value: FormDataEntryValue | null): number | null {
  const next = asOptional(value);
  if (!next) return null;
  const parsed = Number.parseInt(next, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asUuidSet(values: Array<FormDataEntryValue | null>): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const next = asOptional(value);
    if (next) unique.add(next);
  }
  return Array.from(unique);
}

export async function createMeetingAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const customerId = asString(formData.get('customerId'));
  const title = asString(formData.get('title'));
  if (!customerId || !title) {
    redirectError('create_meeting', 'missing_required_fields');
  }

  try {
    await createMeetingForOrg({
      organizationId: context.organizationId,
      customerId,
      title,
      meetingUrl: asOptional(formData.get('meetingUrl')),
      scheduledAt: asOptional(formData.get('scheduledAt')),
      durationMinutes: asOptionalInt(formData.get('durationMinutes')),
      summary: asOptional(formData.get('summary')),
      notes: asOptional(formData.get('notes')),
      participantIds: asUuidSet([formData.get('participantId1'), formData.get('participantId2')]),
      followupTaskTitle: asOptional(formData.get('followupTaskTitle')),
    });
  } catch {
    redirectError('create_meeting');
  }

  revalidatePath('/today');
  redirectSuccess('create_meeting');
}
