import { Pool } from "pg";

export function createPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 20, // cap connections so the service can't exhaust Postgres
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000, // fail fast instead of hanging if the pool is saturated
    statement_timeout: 30_000, // no single query can wedge a connection indefinitely
  });
}
