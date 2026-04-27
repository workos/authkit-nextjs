import { afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { findMemberByAuthIdentity, resetMembersRepository } from './member-store';
import { initializeMembersRepository, resetMembersRepositoryInitialization } from './member-repository-bootstrap';

afterEach(() => {
  resetMembersRepository();
  resetMembersRepositoryInitialization();
});

describe('members repository bootstrap (postgres integration)', () => {
  const itIfDatabaseUrl = process.env.DATABASE_URL ? it : it.skip;

  itIfDatabaseUrl('resolves members from DATABASE_URL-backed postgres repository', async () => {
    const databaseUrl = process.env.DATABASE_URL;
    expect(databaseUrl).toBeTruthy();

    const pool = new Pool({ connectionString: databaseUrl });

    try {
      await pool.query('DROP TABLE IF EXISTS members');
      await pool.query(`
        CREATE TABLE members (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          workos_user_id TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `);

      await pool.query(
        `INSERT INTO members (id, organization_id, workos_user_id, email, role)
         VALUES
           ('member_db_admin', 'org_db', 'user_db_admin', 'admin@db.example.com', 'admin'),
           ('member_other_org', 'org_other', 'user_other', 'admin@db.example.com', 'viewer')`,
      );

      await initializeMembersRepository();

      const memberById = await findMemberByAuthIdentity({
        organizationId: 'org_db',
        workosUserId: 'user_db_admin',
      });
      expect(memberById?.id).toBe('member_db_admin');

      const memberByEmail = await findMemberByAuthIdentity({
        organizationId: 'org_db',
        workosUserId: 'missing_user',
        email: 'ADMIN@DB.EXAMPLE.COM',
      });
      expect(memberByEmail?.id).toBe('member_db_admin');

      const noCrossOrgLeak = await findMemberByAuthIdentity({
        organizationId: 'org_other',
        workosUserId: 'missing_user',
        email: 'admin@db.example.com',
      });
      expect(noCrossOrgLeak?.id).toBe('member_other_org');
    } finally {
      await pool.end();
    }
  });
});
