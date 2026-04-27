import { randomUUID } from 'node:crypto';
import type { MemberRole } from './member-store';

export type CustomerLifecycleStage = 'onboarding' | 'active' | 'renewal' | 'at_risk' | 'churned';
export type RecordStatus = 'active' | 'inactive';
export type PersonRole = 'champion' | 'admin' | 'executive_sponsor' | 'buyer' | 'end_user' | 'blocker' | 'unknown';
export type RelationshipStatus = 'strong' | 'neutral' | 'weak' | 'unknown';

export interface CustomerRecord {
  id: string;
  organizationId: string;
  name: string;
  website: string | null;
  lifecycleStage: CustomerLifecycleStage;
  status: RecordStatus;
  ownerMemberId: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonRecord {
  id: string;
  organizationId: string;
  customerId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  role: PersonRole;
  relationshipStatus: RelationshipStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_ORG = 'org_demo';

const initialCustomers: CustomerRecord[] = [
  {
    id: 'cust_demo_acme',
    organizationId: DEFAULT_ORG,
    name: 'Acme Aerospace',
    website: 'https://acme.example',
    lifecycleStage: 'active',
    status: 'active',
    ownerMemberId: 'member_demo_admin',
    description: 'Strategic enterprise account.',
    createdAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-04-20T09:00:00.000Z',
  },
  {
    id: 'cust_demo_nimbus',
    organizationId: DEFAULT_ORG,
    name: 'Nimbus Health',
    website: 'https://nimbus.example',
    lifecycleStage: 'renewal',
    status: 'active',
    ownerMemberId: 'member_demo_admin',
    description: 'Renewal due this quarter.',
    createdAt: '2026-03-15T09:00:00.000Z',
    updatedAt: '2026-04-23T09:00:00.000Z',
  },
];

const initialPeople: PersonRecord[] = [
  {
    id: 'person_demo_1',
    organizationId: DEFAULT_ORG,
    customerId: 'cust_demo_acme',
    firstName: 'Avery',
    lastName: 'Stone',
    email: 'avery@acme.example',
    phone: null,
    title: 'Director of Ops',
    role: 'champion',
    relationshipStatus: 'strong',
    notes: null,
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
  },
  {
    id: 'person_demo_2',
    organizationId: DEFAULT_ORG,
    customerId: 'cust_demo_nimbus',
    firstName: 'Morgan',
    lastName: 'Lee',
    email: 'morgan@nimbus.example',
    phone: null,
    title: 'VP Success',
    role: 'executive_sponsor',
    relationshipStatus: 'neutral',
    notes: null,
    createdAt: '2026-04-04T10:00:00.000Z',
    updatedAt: '2026-04-24T10:00:00.000Z',
  },
];

let customers: CustomerRecord[] = initialCustomers.map((record) => ({ ...record }));
let people: PersonRecord[] = initialPeople.map((record) => ({ ...record }));

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function canMutate(role: MemberRole): boolean {
  return role !== 'viewer';
}

function assertCanMutate(role: MemberRole): void {
  if (!canMutate(role)) {
    throw new Error('forbidden: read-only role');
  }
}

function findCustomer(organizationId: string, customerId: string): CustomerRecord | undefined {
  return customers.find((customer) => customer.organizationId === organizationId && customer.id === customerId);
}

export function listCustomers(params: { organizationId: string; search?: string }): CustomerRecord[] {
  const { organizationId, search } = params;
  const query = search?.trim().toLowerCase();

  return customers
    .filter((customer) => {
      if (customer.organizationId !== organizationId) return false;
      if (!query) return true;
      return customer.name.toLowerCase().includes(query);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getCustomerById(params: { organizationId: string; customerId: string }): CustomerRecord | null {
  return findCustomer(params.organizationId, params.customerId) ?? null;
}

export function createCustomer(params: {
  organizationId: string;
  actorRole: MemberRole;
  actorMemberId: string;
  name: string;
  website?: string | null;
  lifecycleStage?: CustomerLifecycleStage;
  status?: RecordStatus;
  ownerMemberId?: string | null;
  description?: string | null;
}): CustomerRecord {
  assertCanMutate(params.actorRole);

  const name = params.name.trim();
  if (!name) {
    throw new Error('name is required');
  }

  const requestedOwnerMemberId = normalizeNullable(params.ownerMemberId);
  if (requestedOwnerMemberId && requestedOwnerMemberId !== params.actorMemberId) {
    throw new Error('owner assignment must match authenticated member');
  }

  const timestamp = nowIso();
  const record: CustomerRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    name,
    website: normalizeNullable(params.website),
    lifecycleStage: params.lifecycleStage ?? 'active',
    status: params.status ?? 'active',
    ownerMemberId: requestedOwnerMemberId ?? params.actorMemberId,
    description: normalizeNullable(params.description),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  customers = [record, ...customers];
  return record;
}

export function updateCustomer(params: {
  organizationId: string;
  actorRole: MemberRole;
  actorMemberId: string;
  customerId: string;
  name: string;
  website?: string | null;
  lifecycleStage?: CustomerLifecycleStage;
  status?: RecordStatus;
  ownerMemberId?: string | null;
  description?: string | null;
}): CustomerRecord {
  assertCanMutate(params.actorRole);

  const current = findCustomer(params.organizationId, params.customerId);
  if (!current) {
    throw new Error('customer not found');
  }

  const name = params.name.trim();
  if (!name) {
    throw new Error('name is required');
  }

  const requestedOwnerMemberId = normalizeNullable(params.ownerMemberId);
  if (requestedOwnerMemberId && requestedOwnerMemberId !== params.actorMemberId) {
    throw new Error('owner assignment must match authenticated member');
  }

  const next: CustomerRecord = {
    ...current,
    name,
    website: normalizeNullable(params.website),
    lifecycleStage: params.lifecycleStage ?? current.lifecycleStage,
    status: params.status ?? current.status,
    ownerMemberId: requestedOwnerMemberId ?? current.ownerMemberId,
    description: normalizeNullable(params.description),
    updatedAt: nowIso(),
  };

  customers = customers.map((customer) => (customer.id === current.id ? next : customer));
  return next;
}

export function deleteCustomer(params: {
  organizationId: string;
  actorRole: MemberRole;
  customerId: string;
}): boolean {
  assertCanMutate(params.actorRole);

  const customer = findCustomer(params.organizationId, params.customerId);
  if (!customer) return false;

  customers = customers.filter((candidate) => candidate.id !== customer.id);
  people = people.filter((person) => person.customerId !== customer.id || person.organizationId !== params.organizationId);
  return true;
}

export function listPeople(params: {
  organizationId: string;
  customerId?: string;
  search?: string;
}): PersonRecord[] {
  const query = params.search?.trim().toLowerCase();

  return people
    .filter((person) => {
      if (person.organizationId !== params.organizationId) return false;
      if (params.customerId && person.customerId !== params.customerId) return false;
      if (!query) return true;
      return `${person.firstName} ${person.lastName}`.toLowerCase().includes(query);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPersonById(params: { organizationId: string; personId: string }): PersonRecord | null {
  return people.find((person) => person.organizationId === params.organizationId && person.id === params.personId) ?? null;
}

export function createPerson(params: {
  organizationId: string;
  actorRole: MemberRole;
  customerId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  role?: PersonRole;
  relationshipStatus?: RelationshipStatus;
  notes?: string | null;
}): PersonRecord {
  assertCanMutate(params.actorRole);

  if (!findCustomer(params.organizationId, params.customerId)) {
    throw new Error('customer not found');
  }

  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();

  if (!firstName || !lastName) {
    throw new Error('first and last name are required');
  }

  const timestamp = nowIso();
  const record: PersonRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    customerId: params.customerId,
    firstName,
    lastName,
    email: normalizeNullable(params.email),
    phone: normalizeNullable(params.phone),
    title: normalizeNullable(params.title),
    role: params.role ?? 'unknown',
    relationshipStatus: params.relationshipStatus ?? 'unknown',
    notes: normalizeNullable(params.notes),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  people = [record, ...people];
  return record;
}

export function updatePerson(params: {
  organizationId: string;
  actorRole: MemberRole;
  personId: string;
  customerId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  role?: PersonRole;
  relationshipStatus?: RelationshipStatus;
  notes?: string | null;
}): PersonRecord {
  assertCanMutate(params.actorRole);

  const current = getPersonById({ organizationId: params.organizationId, personId: params.personId });
  if (!current) {
    throw new Error('person not found');
  }

  if (!findCustomer(params.organizationId, params.customerId)) {
    throw new Error('customer not found');
  }

  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();
  if (!firstName || !lastName) {
    throw new Error('first and last name are required');
  }

  const next: PersonRecord = {
    ...current,
    customerId: params.customerId,
    firstName,
    lastName,
    email: normalizeNullable(params.email),
    phone: normalizeNullable(params.phone),
    title: normalizeNullable(params.title),
    role: params.role ?? current.role,
    relationshipStatus: params.relationshipStatus ?? current.relationshipStatus,
    notes: normalizeNullable(params.notes),
    updatedAt: nowIso(),
  };

  people = people.map((person) => (person.id === current.id ? next : person));
  return next;
}

export function deletePerson(params: {
  organizationId: string;
  actorRole: MemberRole;
  personId: string;
}): boolean {
  assertCanMutate(params.actorRole);

  const current = getPersonById({ organizationId: params.organizationId, personId: params.personId });
  if (!current) return false;

  people = people.filter((person) => person.id !== current.id);
  return true;
}

export function getCustomerDetailPanelData(params: {
  organizationId: string;
  customerId: string;
}): {
  customer: CustomerRecord;
  people: PersonRecord[];
} | null {
  const customer = getCustomerById(params);
  if (!customer) return null;

  return {
    customer,
    people: listPeople({ organizationId: params.organizationId, customerId: params.customerId }),
  };
}

export function __resetCustomerPersonStoreForTests(): void {
  customers = initialCustomers.map((record) => ({ ...record }));
  people = initialPeople.map((record) => ({ ...record }));
}
