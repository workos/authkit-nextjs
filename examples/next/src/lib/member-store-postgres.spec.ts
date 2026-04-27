import { describe, expect, it, vi } from 'vitest';
import { createPostgresMembersRepository, type Queryable } from './member-store-postgres';

describe('createPostgresMembersRepository', () => {
  it('uses parameterized query for org + workos user lookup', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: 'member_1',
          organization_id: 'org_1',
          workos_user_id: 'user_1',
          email: 'a@example.com',
          role: 'admin' as const,
        },
      ],
    }));

    const repository = createPostgresMembersRepository({ query } as Queryable);
    const member = await repository.findByOrganizationAndWorkosUserId({
      organizationId: 'org_1',
      workosUserId: 'user_1',
    });

    expect(member).toEqual({
      id: 'member_1',
      organizationId: 'org_1',
      workosUserId: 'user_1',
      email: 'a@example.com',
      role: 'admin',
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('organization_id = $1 AND workos_user_id = $2'), [
      'org_1',
      'user_1',
    ]);
  });

  it('uses case-insensitive parameterized email fallback query', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: 'member_2',
          organization_id: 'org_2',
          workos_user_id: 'user_2',
          email: 'B@Example.com',
          role: 'manager' as const,
        },
      ],
    }));

    const repository = createPostgresMembersRepository({ query } as Queryable);
    const member = await repository.findByOrganizationAndEmail({
      organizationId: 'org_2',
      email: 'b@example.com',
    });

    expect(member?.id).toBe('member_2');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('lower(email) = lower($2)'), ['org_2', 'b@example.com']);
  });

  it('returns null when no rows match', async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    const repository = createPostgresMembersRepository({ query } as Queryable);
    const member = await repository.findByOrganizationAndWorkosUserId({
      organizationId: 'org_none',
      workosUserId: 'user_none',
    });

    expect(member).toBeNull();
  });
});
