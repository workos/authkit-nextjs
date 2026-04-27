export type MemberRole = 'admin' | 'manager' | 'csm' | 'am' | 'viewer';

export interface MemberRecord {
  id: string;
  organizationId: string;
  workosUserId: string;
  email: string;
  role: MemberRole;
}

export interface MembersRepository {
  findByOrganizationAndWorkosUserId(params: { organizationId: string; workosUserId: string }): Promise<MemberRecord | null>;
  findByOrganizationAndEmail(params: { organizationId: string; email: string }): Promise<MemberRecord | null>;
}

class InMemoryMembersRepository implements MembersRepository {
  constructor(private readonly members: readonly MemberRecord[]) {}

  async findByOrganizationAndWorkosUserId(params: {
    organizationId: string;
    workosUserId: string;
  }): Promise<MemberRecord | null> {
    const { organizationId, workosUserId } = params;
    return (
      this.members.find(
        (member) => member.organizationId === organizationId && member.workosUserId === workosUserId,
      ) ?? null
    );
  }

  async findByOrganizationAndEmail(params: { organizationId: string; email: string }): Promise<MemberRecord | null> {
    const { organizationId, email } = params;
    return (
      this.members.find(
        (member) => member.organizationId === organizationId && member.email.toLowerCase() === email.toLowerCase(),
      ) ?? null
    );
  }
}

const DEFAULT_MEMBER_RECORDS: readonly MemberRecord[] = [
  {
    id: 'member_demo_admin',
    organizationId: 'org_demo',
    workosUserId: 'user_demo_admin',
    email: 'admin@example.com',
    role: 'admin',
  },
  {
    id: 'member_secondary_manager',
    organizationId: 'org_secondary',
    workosUserId: 'user_secondary_manager',
    email: 'manager@secondary.example.com',
    role: 'manager',
  },
];

let membersRepository: MembersRepository = new InMemoryMembersRepository(DEFAULT_MEMBER_RECORDS);

export function setMembersRepository(repository: MembersRepository): void {
  membersRepository = repository;
}

export function resetMembersRepository(): void {
  membersRepository = new InMemoryMembersRepository(DEFAULT_MEMBER_RECORDS);
}

export async function findMemberByAuthIdentity(params: {
  organizationId: string;
  workosUserId: string;
  email?: string | null;
}): Promise<MemberRecord | null> {
  const { organizationId, workosUserId, email } = params;

  const memberByUserId = await membersRepository.findByOrganizationAndWorkosUserId({ organizationId, workosUserId });
  if (memberByUserId) return memberByUserId;

  if (!email) return null;

  return await membersRepository.findByOrganizationAndEmail({
    organizationId,
    email,
  });
}

export { createPostgresMembersRepository, type Queryable } from './member-store-postgres';
