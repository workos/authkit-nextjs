'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMemberContext } from '@/lib/auth-context';
import {
  createCustomer,
  createPerson,
  deleteCustomer,
  deletePerson,
  updateCustomer,
  type CustomerLifecycleStage,
  type RecordStatus,
  type PersonRole,
  type RelationshipStatus,
} from '@/lib/customer-person-store';

function asString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function asOptional(value: FormDataEntryValue | null): string | null {
  const next = asString(value).trim();
  return next ? next : null;
}

function asLifecycleStage(value: FormDataEntryValue | null): CustomerLifecycleStage {
  const next = asString(value);
  if (next === 'onboarding' || next === 'active' || next === 'renewal' || next === 'at_risk' || next === 'churned') {
    return next;
  }
  return 'active';
}

function asRecordStatus(value: FormDataEntryValue | null): RecordStatus {
  const next = asString(value);
  if (next === 'active' || next === 'inactive') {
    return next;
  }
  return 'active';
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

export async function createCustomerAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();

  createCustomer({
    organizationId: context.organizationId,
    actorRole: context.role,
    actorMemberId: context.memberId,
    name: asString(formData.get('name')),
    website: asOptional(formData.get('website')),
    lifecycleStage: asLifecycleStage(formData.get('lifecycleStage')),
    status: asRecordStatus(formData.get('status')),
    ownerMemberId: asOptional(formData.get('ownerMemberId')),
    description: asOptional(formData.get('description')),
  });

  revalidatePath('/customers');
  redirect('/customers');
}

export async function updateCustomerAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const customerId = asString(formData.get('customerId'));

  updateCustomer({
    organizationId: context.organizationId,
    actorRole: context.role,
    actorMemberId: context.memberId,
    customerId,
    name: asString(formData.get('name')),
    website: asOptional(formData.get('website')),
    lifecycleStage: asLifecycleStage(formData.get('lifecycleStage')),
    status: asRecordStatus(formData.get('status')),
    ownerMemberId: asOptional(formData.get('ownerMemberId')),
    description: asOptional(formData.get('description')),
  });

  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}

export async function deleteCustomerAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const customerId = asString(formData.get('customerId'));

  deleteCustomer({
    organizationId: context.organizationId,
    actorRole: context.role,
    customerId,
  });

  revalidatePath('/customers');
  revalidatePath('/people');
  redirect('/customers');
}

export async function createPersonForCustomerAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const customerId = asString(formData.get('customerId'));

  createPerson({
    organizationId: context.organizationId,
    actorRole: context.role,
    customerId,
    firstName: asString(formData.get('firstName')),
    lastName: asString(formData.get('lastName')),
    email: asOptional(formData.get('email')),
    phone: asOptional(formData.get('phone')),
    title: asOptional(formData.get('title')),
    role: asPersonRole(formData.get('role')),
    relationshipStatus: asRelationshipStatus(formData.get('relationshipStatus')),
    notes: asOptional(formData.get('notes')),
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/people');
  redirect(`/customers/${customerId}`);
}

export async function deletePersonAction(formData: FormData): Promise<void> {
  const context = await requireMemberContext();
  const personId = asString(formData.get('personId'));
  const customerId = asString(formData.get('customerId'));

  deletePerson({
    organizationId: context.organizationId,
    actorRole: context.role,
    personId,
  });

  revalidatePath('/people');
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}
