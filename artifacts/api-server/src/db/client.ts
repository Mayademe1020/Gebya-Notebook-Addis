import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type Pool as PgPool } from "pg";
import * as schema from "./schema.js";

let pool: PgPool | null = null;
let database: NodePgDatabase<typeof schema> | null = null;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. Staff sale event persistence is unavailable.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || "";
}

function shouldUseSsl(databaseUrl: string) {
  if (process.env.PGSSLMODE === "disable") return false;
  return process.env.PGSSLMODE === "require"
    || databaseUrl.includes("sslmode=require")
    || process.env.NODE_ENV === "production";
}

export function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new DatabaseNotConfiguredError();
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.PGPOOL_MAX || 5),
      ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    });
    database = drizzle(pool, { schema });
  }

  return database as NodePgDatabase<typeof schema>;
}
