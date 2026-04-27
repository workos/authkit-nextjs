'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMemberContext } from '@/lib/auth-context';
import { createPerson, deletePerson, type PersonRole, type RelationshipStatus } from '@/lib/customer-person-store';

function asString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function asOptional(value: FormDataEntryValue | null): string | null {
  const next = asString(value).trim();
  return next ? next : null;
}

function asPersonRole(value: FormDataEntryValue | null): PersonRole {
  const next = asString(value);
  if (
    next === 'champion' ||
    next === 'admin' ||
    next === 'executive_sponsor' ||
    next === 'buyer' ||
    next === 'end_user' ||
    next === 'blocker' ||
    next === 'unknown'
  ) {
    return next;
  }
  return 'unknown';
}

function asRelationshipStatus(value: FormDataEntryValue | null): RelationshipStatus {
  const next = asString(value);
  if (next === 'strong' || next === 'neutral' || next === 'weak' || next === 'unknown') {
    return next;
  }
  return 'unknown';
}

export async function createPersonAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();

  createPerson({
    organizationId: context.organizationId,
    actorRole: context.role,
    customerId: asString(formData.get('customerId')),
    firstName: asString(formData.get('firstName')),
    lastName: asString(formData.get('lastName')),
    email: asOptional(formData.get('email')),
    phone: asOptional(formData.get('phone')),
    title: asOptional(formData.get('title')),
    role: asPersonRole(formData.get('role')),
    relationshipStatus: asRelationshipStatus(formData.get('relationshipStatus')),
    notes: asOptional(formData.get('notes')),
  });

  revalidatePath('/people');
  redirect('/people');
}

export async function deletePersonFromPeoplePageAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();

  deletePerson({
    organizationId: context.organizationId,
    actorRole: context.role,
    personId: asString(formData.get('personId')),
  });

  revalidatePath('/people');
  redirect('/people');
}
