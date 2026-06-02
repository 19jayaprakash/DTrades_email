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

    console.log("\n--- Querying public.attachments joined with attachment_contents ---");
    const res = await client.query(`
      SELECT a.id, a.name, a.filename, a.type, a.is_active, length(c.content) as content_length
      FROM attachments a
      LEFT JOIN attachment_contents c ON c.attachment_id = a.id;
    `);
    
    console.log(`Total attachments matched: ${res.rows.length}`);
    res.rows.forEach(r => {
      console.log(`Attachment: ID=${r.id}, Name="${r.name}", Type="${r.type}", isActive=${r.is_active}, Content Length=${r.content_length}`);
    });

  } catch (err) {
    console.error("DB query failed:", err);
  } finally {
    await client.end();
  }
}

run();
