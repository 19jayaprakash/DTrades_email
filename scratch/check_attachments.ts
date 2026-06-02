import { db, attachmentsTable, attachmentContentsTable } from "../lib/db/src";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Fetching all attachments...");
  const attachments = await db.select().from(attachmentsTable);
  console.log("Attachments count:", attachments.length);
  for (const att of attachments) {
    console.log(`- ID: ${att.id}, Name: "${att.name}", Type: "${att.type}", Mime: "${att.mimeType}", Filename: "${att.filename}", IsActive: ${att.isActive}`);
    
    // Check if content exists
    const [contentRow] = await db
      .select()
      .from(attachmentContentsTable)
      .where(eq(attachmentContentsTable.attachmentId, att.id))
      .limit(1);
    
    if (contentRow) {
      console.log(`  -> Content exists, length: ${contentRow.content.length}, preview (first 50 chars): "${contentRow.content.substring(0, 50)}..."`);
    } else {
      console.log(`  -> NO CONTENT ROW FOUND!`);
    }
  }
}

main().catch(console.error);
