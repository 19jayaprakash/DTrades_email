// fix-passwords.ts – run with: pnpm --filter @workspace/scripts exec tsx ../scratch/fix-passwords.ts
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const updates = [
  { email: "admin@dtradesinternational.in", plain: "Admin@123" },
  { email: "usa@dtradesinternational.in", plain: "Usa@123" },
  { email: "dtrades.team@gmail.com", plain: "Dtrades@123" },
  { email: "singapore@dtradesinternational.in", plain: "Sing@123" },
];

async function run() {
  for (const { email, plain } of updates) {
    const hash = await bcrypt.hash(plain, 10);
    const result = await db.execute(
      sql`UPDATE users SET password_hash = ${hash}, password_plain = ${plain} WHERE LOWER(email) = LOWER(${email}) RETURNING id, email`
    );
    const rows = result.rows as Array<{ id: number; email: string }>;
    if (rows.length > 0) {
      console.log(`✅ Updated: ${rows[0].email} → ${plain}`);
    } else {
      console.log(`⚠️  Not found: ${email}`);
    }
  }
  console.log("All done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
