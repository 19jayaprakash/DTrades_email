import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const updates = [
    { email: "admin@dtradesinternational.in", plain: "Admin@123" },
    { email: "usa@dtradesinternational.in", plain: "Usa@123" },
    { email: "dtrades.team@gmail.com", plain: "Dtrades@123" },
    { email: "Singapore@dtradesinternational.in", plain: "Sing@123" },
    { email: "singapore@dtradesinternational.in", plain: "Sing@123" },
  ];

  for (const { email, plain } of updates) {
    const hash = await bcrypt.hash(plain, 10);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, password_plain = $2 WHERE LOWER(email) = LOWER($3) RETURNING id, email`,
      [hash, plain, email]
    );
    if (result.rows.length > 0) {
      console.log(`✅ Updated: ${result.rows[0].email} → ${plain}`);
    } else {
      console.log(`⚠️  Not found: ${email}`);
    }
  }

  await pool.end();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
