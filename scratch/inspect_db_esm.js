import pg from "pg";

const { Pool } = pg;

async function main() {
  console.log("Connecting to live Database...");
  console.log("Connection URL check:", process.env.DATABASE_URL ? "DATABASE_URL is set" : "DATABASE_URL is NOT set");
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const columnsRes = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'attachments';
    `);
    console.log("--- attachments Table Schema in live Database ---");
    console.table(columnsRes.rows);

    const junctionRes = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_attachments';
    `);
    console.log("--- user_attachments Junction Table Schema in live Database ---");
    console.table(junctionRes.rows);

    // Check count of attachments
    const countRes = await pool.query(`SELECT COUNT(*) FROM attachments;`);
    console.log("Number of documents in attachments table:", countRes.rows[0].count);

  } catch (err) {
    console.error("Database Inspection Error:", err);
  } finally {
    await pool.end();
  }
}

main();
