import { pool } from "../lib/db/src";
import bcrypt from "bcryptjs";

async function run() {
  const updates = [
    { email: "usa@dtradesinternational.in", plain: "Usa@123" },
    { email: "admin@dtradesinternational.in", plain: "Admin@123" },
    { email: "dtrades.team@gmail.com", plain: "Dtrades@123" },
    { email: "Singapore@dtradesinternational.in", plain: "Sing@123" }
  ];

  console.log("Starting password hash update via native SQL...");

  for (const item of updates) {
    const hash = await bcrypt.hash(item.plain, 10);
    console.log(`Hashing password for ${item.email}...`);
    
    const result = await pool.query(
      "UPDATE users SET password_hash = $1 WHERE LOWER(email) = LOWER($2) RETURNING email",
      [hash, item.email]
    );
      
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Successfully updated ${item.rows[0].email} with new hash: ${hash}`);
    } else {
      console.log(`Warning: User with email ${item.email} was not found in the database.`);
    }
  }

  console.log("All updates completed successfully.");
  await pool.end();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("Failed to update passwords:", err);
  await pool.end();
  process.exit(1);
});
