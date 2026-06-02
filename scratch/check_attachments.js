const { Client } = require("pg");
require("dotenv").config({ path: "../.env" });

// If dotenv didn't load from parent dir, let's load from current process dir
if (!process.env.DATABASE_URL) {
  require("dotenv").config();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL environment variable is not defined.");
    process.exit(1);
  }

  console.log("Connecting to database:", databaseUrl.replace(/:[^:@\n]+@/, ":****@"));
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log("\n--- ATTACHMENTS TABLE ---");
    const attRes = await client.query("SELECT id, user_id, type, name, filename, mime_type, is_active, created_at FROM attachments;");
    console.log("Found attachments:", attRes.rowCount);
    for (const row of attRes.rows) {
      console.log(`ID: ${row.id} | Name: "${row.name}" | Type: "${row.type}" | Mime: "${row.mime_type}" | Filename: "${row.filename}" | IsActive: ${row.is_active}`);
      
      const contentRes = await client.query("SELECT attachment_id, length(content) as len, substring(content, 1, 50) as sub FROM attachment_contents WHERE attachment_id = $1;", [row.id]);
      if (contentRes.rowCount > 0) {
        console.log(`  -> Content row exists! Length: ${contentRes.rows[0].len} | Substring: "${contentRes.rows[0].sub}..."`);
      } else {
        console.log(`  -> NO CONTENT ROW FOUND!`);
      }
    }
  } catch (err) {
    console.error("Database error:", err);
  } finally {
    await client.end();
  }
}

main();
