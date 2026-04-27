import { afterEach, describe, expect, it } from 'vitest';
import { findMemberByAuthIdentity, resetMembersRepository } from './member-store';
import { initializeMembersRepository, resetMembersRepositoryInitialization } from './member-repository-bootstrap';

afterEach(() => {
  resetMembersRepository();
  resetMembersRepositoryInitialization();
});

describe('initializeMembersRepository', () => {
  it('binds postgres adapter when queryable is provided', async () => {
    const queryable = {
      async query() {
        return {
          rows: [
            {
              id: 'member_db_1',
              organization_id: 'org_db',
              workos_user_id: 'user_db',
              email: 'db@example.com',
              role: 'viewer' as const,
            },
          ],
        };
      },
    };

    await initializeMembersRepository({ queryable });

    const member = await findMemberByAuthIdentity({
      organizationId: 'org_db',
      workosUserId: 'user_db',
    });

    expect(member?.id).toBe('member_db_1');
  });

  it('keeps default in-memory resolver when no db url and no queryable are provided', async () => {
    await initializeMembersRepository();

    const member = await findMemberByAuthIdentity({
      organizationId: 'org_demo',
      workosUserId: 'user_demo_admin',
    });

    expect(member?.id).toBe('member_demo_admin');
  });
});
