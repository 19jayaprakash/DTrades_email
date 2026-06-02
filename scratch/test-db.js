import { db, attachmentsTable } from "@workspace/db";

async function run() {
  try {
    console.log("Database connection testing...");
    const result = await db.select().from(attachmentsTable).limit(5);
    console.log("Select success! Found attachments:", result);
  } catch (err) {
    console.error("DB error:", err);
  } finally {
    process.exit(0);
  }
}

run();
