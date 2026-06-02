import { pool } from "../lib/db/src/index.ts";

async function main() {
  console.log("Connecting to database...");
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'attachments';
    `);
    console.log("Attachments Table Schema:");
    console.table(res.rows);

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
    `);
    console.log("All Tables in Database:");
    console.table(tables.rows);
  } catch (err) {
    console.error("Error inspecting database:", err);
  } finally {
    await pool.end();
  }
}

main();
