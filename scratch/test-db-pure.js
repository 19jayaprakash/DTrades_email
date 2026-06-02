const { Pool } = require("pg");
require("dotenv").config();

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_dfvhAMH1j8my@ep-patient-cake-aphg0fzc-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  });

  try {
    console.log("Connecting directly to PG...");
    const res = await pool.query("SELECT id, type, name, filename FROM attachments LIMIT 5;");
    console.log("Success! Found rows:", res.rows);
  } catch (err) {
    console.error("PG query error:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

run();
