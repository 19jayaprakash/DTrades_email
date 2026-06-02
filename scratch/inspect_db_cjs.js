const { Pool } = require("pg");
require("dotenv").config({ path: ".env" });

async function main() {
  console.log("Connecting to Database...");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'attachments';
    `);
    console.log("Attachments Columns in Database:");
    console.table(res.rows);
    
    // Also inspect user_attachments
    const resJunction = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_attachments';
    `);
    console.log("user_attachments Junction Columns in Database:");
    console.table(resJunction.rows);
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await pool.end();
  }
}

main();
