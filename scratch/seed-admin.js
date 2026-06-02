const pg = require("pg");
const bcrypt = require("bcryptjs");

const connectionString = "postgresql://neondb_owner:npg_dfvhAMH1j8my@ep-patient-cake-aphg0fzc-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function main() {
  const pool = new pg.Pool({ connectionString });
  
  try {
    console.log("Connecting to database...");
    const client = await pool.connect();
    
    console.log("Checking if admin user already exists...");
    const checkRes = await client.query("SELECT id FROM users WHERE email = $1", ["admin@mailflow.io"]);
    
    if (checkRes.rows.length > 0) {
      console.log("Admin user already exists. ID:", checkRes.rows[0].id);
    } else {
      console.log("Hashing password...");
      const passwordHash = await bcrypt.hash("admin123", 10);
      
      console.log("Inserting admin user...");
      const insertQuery = `
        INSERT INTO users (email, name, password_hash, password_plain, role, is_active, created_at)
        VALUES ($1, $2, $3, $4, 'admin', true, NOW())
        RETURNING id
      `;
      
      const insertRes = await client.query(insertQuery, [
        "admin@mailflow.io",
        "Administrator",
        passwordHash,
        "admin123"
      ]);
      
      console.log("Admin user created successfully! ID:", insertRes.rows[0].id);
    }
    
    client.release();
  } catch (err) {
    console.error("Error seeding database:", err);
  } finally {
    await pool.end();
  }
}

main();
