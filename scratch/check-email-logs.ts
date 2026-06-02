import { db, emailLogsTable } from "../lib/db/src";
import { desc } from "drizzle-orm";

async function run() {
  console.log("--- LAST 5 EMAIL LOGS ---");
  const logs = await db.select()
    .from(emailLogsTable)
    .orderBy(desc(emailLogsTable.id))
    .limit(5);
  
  console.log(logs.map(l => ({
    id: l.id,
    recipientEmail: l.recipientEmail,
    status: l.status,
    errorMessage: l.errorMessage,
    errorType: l.errorType,
    sentAt: l.sentAt,
    createdAt: l.createdAt
  })));
  
  process.exit(0);
}

run().catch(console.error);
