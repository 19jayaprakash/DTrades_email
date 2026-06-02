import { db } from "../lib/db/src";
import { sql } from "drizzle-orm";

async function run() {
  console.log("--- ACCOUNTS COLUMNS ---");
  const accountsCols = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'accounts'
  `);
  console.log(accountsCols.rows);

  console.log("--- USERS COLUMNS ---");
  const usersCols = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
  `);
  console.log(usersCols.rows);

  process.exit(0);
}

run().catch(console.error);
