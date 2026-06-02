const pg = require("pg");

async function check() {
  const client = new pg.Client({
    connectionString: "postgresql://neondb_owner:npg_dfvhAMH1j8my@ep-patient-cake-aphg0fzc-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  await client.connect();

  console.log("--- USERS ---");
  const usersRes = await client.query("SELECT id, name, email, role, region, is_active FROM users");
  console.log(usersRes.rows);

  console.log("--- ACCOUNTS ---");
  const accountsRes = await client.query("SELECT id, name, email, region, smtp_host, smtp_port, smtp_user, smtp_pass, is_active FROM accounts");
  console.log(accountsRes.rows.map(r => ({ ...r, smtp_pass: "REDACTED" })));

  await client.end();
}

check().catch(console.error);
