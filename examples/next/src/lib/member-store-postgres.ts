import type { MembersRepository, MemberRecord } from './member-store';

interface QueryResultRow {
  id: string;
  organization_id: string;
  workos_user_id: string;
  email: string;
  role: MemberRecord['role'];
}

export interface Queryable {
  query(text: string, params: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

function mapRowToMember(row: QueryResultRow): MemberRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workosUserId: row.workos_user_id,
    email: row.email,
    role: row.role,
  };
}

export function createPostgresMembersRepository(queryable: Queryable): MembersRepository {
  return {
    async findByOrganizationAndWorkosUserId(params: { organizationId: string; workosUserId: string }) {
      const { organizationId, workosUserId } = params;

      const result = await queryable.query(
        `SELECT id, organization_id, workos_user_id, email, role
         FROM members
         WHERE organization_id = $1 AND workos_user_id = $2
         LIMIT 1`,
        [organizationId, workosUserId],
      );

      const row = result.rows[0] as QueryResultRow | undefined;
      return row ? mapRowToMember(row) : null;
    },

    async findByOrganizationAndEmail(params: { organizationId: string; email: string }) {
      const { organizationId, email } = params;

      const result = await queryable.query(
        `SELECT id, organization_id, workos_user_id, email, role
         FROM members
         WHERE organization_id = $1 AND lower(email) = lower($2)
         LIMIT 1`,
        [organizationId, email],
      );

      const row = result.rows[0] as QueryResultRow | undefined;
      return row ? mapRowToMember(row) : null;
    },
  };
}
