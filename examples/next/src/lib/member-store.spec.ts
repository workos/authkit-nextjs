import { afterEach, describe, expect, it, vi } from 'vitest';
import { findMemberByAuthIdentity, resetMembersRepository, setMembersRepository, type MembersRepository } from './member-store';

afterEach(() => {
  resetMembersRepository();
});

describe('findMemberByAuthIdentity', () => {
  it('finds member by organization + workos user id', async () => {
    const member = await findMemberByAuthIdentity({
      organizationId: 'org_demo',
      workosUserId: 'user_demo_admin',
    });

    expect(member?.id).toBe('member_demo_admin');
  });

  it('does not leak members across organizations', async () => {
    const member = await findMemberByAuthIdentity({
      organizationId: 'org_secondary',
      workosUserId: 'user_demo_admin',
    });

    expect(member).toBeNull();
  });

  it('falls back to same-org email lookup only', async () => {
    const member = await findMemberByAuthIdentity({
      organizationId: 'org_demo',
      workosUserId: 'missing_user',
      email: 'admin@example.com',
    });

    expect(member?.id).toBe('member_demo_admin');
  });

  it('rejects cross-org email fallback', async () => {
    const member = await findMemberByAuthIdentity({
      organizationId: 'org_secondary',
      workosUserId: 'missing_user',
      email: 'admin@example.com',
    });

    expect(member).toBeNull();
  });

  it('uses injected repository implementation for org-scoped lookup', async () => {
    const repository: MembersRepository = {
      findByOrganizationAndWorkosUserId: vi.fn(async ({ organizationId, workosUserId }: { organizationId: string; workosUserId: string }) => ({
        id: `member:${organizationId}:${workosUserId}`,
        organizationId,
        workosUserId,
        email: 'custom@example.com',
        role: 'viewer' as const,
      })),
      findByOrganizationAndEmail: vi.fn(async () => null),
    };

    setMembersRepository(repository);

    const member = await findMemberByAuthIdentity({
      organizationId: 'org_custom',
      workosUserId: 'user_custom',
    });

    expect(member?.id).toBe('member:org_custom:user_custom');
    expect(repository.findByOrganizationAndWorkosUserId).toHaveBeenCalledWith({
      organizationId: 'org_custom',
      workosUserId: 'user_custom',
    });
  });
});
