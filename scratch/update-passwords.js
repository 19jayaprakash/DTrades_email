import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function run() {
  const updates = [
    { email: "usa@dtradesinternational.in", plain: "Usa@123" },
    { email: "admin@dtradesinternational.in", plain: "Admin@123" },
    { email: "dtrades.team@gmail.com", plain: "Dtrades@123" },
    { email: "Singapore@dtradesinternational.in", plain: "Sing@123" }
  ];

  console.log("Starting password hash updates via Drizzle inside api-server...");

  for (const item of updates) {
    const hash = await bcrypt.hash(item.plain, 10);
    console.log(`Hashing password for ${item.email}...`);
    
    const result = await db.update(usersTable)
      .set({ passwordHash: hash })
      .where(eq(usersTable.email, item.email))
      .returning({ email: usersTable.email });
      
    if (result.length > 0) {
      console.log(`Successfully updated ${result[0].email} to new hash: ${hash}`);
    } else {
      console.log(`Warning: User with email ${item.email} was not found.`);
    }
  }

  console.log("All updates completed successfully.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to update passwords:", err);
  process.exit(1);
});
