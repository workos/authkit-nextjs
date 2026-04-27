import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetCustomerPersonStoreForTests,
  createCustomer,
  createPerson,
  deleteCustomer,
  getCustomerDetailPanelData,
  listCustomers,
  listPeople,
} from './customer-person-store';

describe('customer/person end-to-end flows', () => {
  beforeEach(() => {
    __resetCustomerPersonStoreForTests();
  });

  it('creates customer, links person, surfaces detail panel data, and cascades on delete', () => {
    const customer = createCustomer({
      organizationId: 'org_demo',
      actorRole: 'manager',
      actorMemberId: 'member_demo_admin',
      name: 'Vector Freight',
      lifecycleStage: 'onboarding',
      status: 'active',
      description: 'E2E flow verification account',
    });

    const person = createPerson({
      organizationId: 'org_demo',
      actorRole: 'manager',
      customerId: customer.id,
      firstName: 'Dana',
      lastName: 'Rios',
      email: 'dana@vector.example',
      role: 'champion',
      relationshipStatus: 'strong',
    });

    const detail = getCustomerDetailPanelData({
      organizationId: 'org_demo',
      customerId: customer.id,
    });

    expect(detail?.customer.id).toBe(customer.id);
    expect(detail?.people.map((item) => item.id)).toContain(person.id);

    const removed = deleteCustomer({
      organizationId: 'org_demo',
      actorRole: 'manager',
      customerId: customer.id,
    });

    expect(removed).toBe(true);
    expect(listCustomers({ organizationId: 'org_demo' }).some((item) => item.id === customer.id)).toBe(false);
    expect(listPeople({ organizationId: 'org_demo' }).some((item) => item.id === person.id)).toBe(false);
  });

  it('keeps organizations isolated for list and detail queries', () => {
    const orgA = createCustomer({
      organizationId: 'org_a',
      actorRole: 'admin',
      actorMemberId: 'member_a',
      name: 'Org A Customer',
    });

    createPerson({
      organizationId: 'org_a',
      actorRole: 'admin',
      customerId: orgA.id,
      firstName: 'Alex',
      lastName: 'OrgA',
    });

    const orgAList = listCustomers({ organizationId: 'org_a' });
    const orgBList = listCustomers({ organizationId: 'org_b' });
    const orgBDetail = getCustomerDetailPanelData({ organizationId: 'org_b', customerId: orgA.id });

    expect(orgAList.some((customer) => customer.id === orgA.id)).toBe(true);
    expect(orgBList.some((customer) => customer.id === orgA.id)).toBe(false);
    expect(orgBDetail).toBeNull();
  });
});
