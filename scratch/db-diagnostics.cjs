const pg = require("pg");

const databaseUrl = "postgresql://neondb_owner:npg_dfvhAMH1j8my@ep-patient-cake-aphg0fzc-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function run() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Neon DB successfully!");

    console.log("\n--- Checking attachments table columns ---");
    const columnsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'attachments';
    `);
    columnsRes.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });

    console.log("\n--- Checking attachment_contents table columns ---");
    const columnsRes2 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'attachment_contents';
    `);
    columnsRes2.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });

    console.log("\n--- Querying public.attachments ---");
    const attRes = await client.query("SELECT * FROM attachments LIMIT 10;");
    console.log(`Total rows in attachments: ${attRes.rows.length}`);
    attRes.rows.forEach(r => {
      console.log(`Row: ID=${r.id}, Name="${r.name}", Filename="${r.filename}", Type="${r.type}", isActive=${r.is_active}`);
    });

  } catch (err) {
    console.error("DB diagnostic failed:", err);
  } finally {
    await client.end();
  }
}

run();
