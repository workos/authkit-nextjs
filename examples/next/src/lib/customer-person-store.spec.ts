import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetCustomerPersonStoreForTests,
  createCustomer,
  createPerson,
  deleteCustomer,
  getCustomerById,
  getCustomerDetailPanelData,
  listCustomers,
  listPeople,
  updateCustomer,
} from './customer-person-store';

describe('customer-person-store', () => {
  beforeEach(() => {
    __resetCustomerPersonStoreForTests();
  });

  it('creates and updates a customer within org scope', () => {
    const created = createCustomer({
      organizationId: 'org_demo',
      actorRole: 'admin',
      actorMemberId: 'member_demo_admin',
      name: 'Orbit Labs',
      lifecycleStage: 'onboarding',
      status: 'active',
    });

    const updated = updateCustomer({
      organizationId: 'org_demo',
      actorRole: 'admin',
      actorMemberId: 'member_demo_admin',
      customerId: created.id,
      name: 'Orbit Labs Inc',
      lifecycleStage: 'active',
      status: 'active',
    });

    expect(updated.name).toBe('Orbit Labs Inc');
    expect(getCustomerById({ organizationId: 'org_demo', customerId: created.id })?.name).toBe('Orbit Labs Inc');
  });

  it('blocks viewer from mutation paths', () => {
    expect(() =>
      createCustomer({
        organizationId: 'org_demo',
        actorRole: 'viewer',
        actorMemberId: 'member_demo_admin',
        name: 'Blocked Co',
      }),
    ).toThrow(/forbidden/);
  });

  it('rejects spoofed owner assignment on create and update', () => {
    expect(() =>
      createCustomer({
        organizationId: 'org_demo',
        actorRole: 'admin',
        actorMemberId: 'member_demo_admin',
        ownerMemberId: 'member_other',
        name: 'Spoof Owner',
      }),
    ).toThrow(/owner assignment/);

    const created = createCustomer({
      organizationId: 'org_demo',
      actorRole: 'admin',
      actorMemberId: 'member_demo_admin',
      name: 'Legit Owner',
    });

    expect(() =>
      updateCustomer({
        organizationId: 'org_demo',
        actorRole: 'admin',
        actorMemberId: 'member_demo_admin',
        customerId: created.id,
        ownerMemberId: 'member_other',
        name: created.name,
      }),
    ).toThrow(/owner assignment/);
  });

  it('rejects person creation when customer is outside org scope', () => {
    const otherOrgCustomer = createCustomer({
      organizationId: 'org_other',
      actorRole: 'admin',
      actorMemberId: 'member_other_admin',
      name: 'Other Org',
    });

    expect(() =>
      createPerson({
        organizationId: 'org_demo',
        actorRole: 'admin',
        customerId: otherOrgCustomer.id,
        firstName: 'Casey',
        lastName: 'WrongOrg',
      }),
    ).toThrow(/customer not found/);
  });

  it('cascades people deletion when customer is deleted', () => {
    const createdCustomer = createCustomer({
      organizationId: 'org_demo',
      actorRole: 'admin',
      actorMemberId: 'member_demo_admin',
      name: 'Cascade Corp',
    });

    createPerson({
      organizationId: 'org_demo',
      actorRole: 'admin',
      customerId: createdCustomer.id,
      firstName: 'Jamie',
      lastName: 'Cascade',
    });

    const deleted = deleteCustomer({ organizationId: 'org_demo', actorRole: 'admin', customerId: createdCustomer.id });
    const remainingPeople = listPeople({ organizationId: 'org_demo', customerId: createdCustomer.id });

    expect(deleted).toBe(true);
    expect(remainingPeople).toHaveLength(0);
  });

  it('returns customer detail panel data with org-scoped people', () => {
    const [first] = listCustomers({ organizationId: 'org_demo' });
    const detail = getCustomerDetailPanelData({ organizationId: 'org_demo', customerId: first.id });

    expect(detail?.customer.id).toBe(first.id);
    expect(detail?.people.every((person) => person.customerId === first.id)).toBe(true);
  });
});
