import { createPostgresMembersRepository, setMembersRepository, type Queryable } from './member-store';

let initialized = false;

export async function initializeMembersRepository(options?: { queryable?: Queryable }): Promise<void> {
  if (initialized) return;

  if (options?.queryable) {
    setMembersRepository(createPostgresMembersRepository(options.queryable));
    initialized = true;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    initialized = true;
    return;
  }

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
  });

  setMembersRepository(createPostgresMembersRepository(pool));
  initialized = true;
}

export function resetMembersRepositoryInitialization(): void {
  initialized = false;
}
