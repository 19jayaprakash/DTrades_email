import { db, accountsTable } from "../lib/db/src";
import { eq } from "drizzle-orm";

async function run() {
  console.log("Updating USA Team account email...");
  const result = await db.update(accountsTable)
    .set({
      email: "usa@dtradesinternational.in",
      smtpUser: "usa@dtradesinternational.in"
    })
    .where(eq(accountsTable.email, "usa@mailflow.io"))
    .returning();
  
  console.log("Update result:", result);
  process.exit(0);
}

run().catch(console.error);
