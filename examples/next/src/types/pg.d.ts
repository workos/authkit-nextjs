declare module 'pg' {
  export class Pool {
    constructor(options?: { connectionString?: string; max?: number });
    query(text: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  }
}
