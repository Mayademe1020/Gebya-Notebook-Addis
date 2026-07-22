import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "[db] WARNING: DATABASE_URL is not set. Database operations will fail at runtime.",
  );
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
export const db = pool ? drizzle(pool, { schema }) : null;

export * from "./schema";
export { getCustomerBalances, enrichWithTelegram } from "./utils/customerBalance.js";
export type { CustomerBalanceRow, CustomerWithTelegram } from "./utils/customerBalance.js";
