import { db, usersTable, accountsTable } from "../lib/db/src";

async function check() {
  console.log("--- USERS ---");
  const users = await db.select().from(usersTable);
  console.log(users.map(u => ({ id: u.id, name: u.name, email: u.email, passwordHash: u.passwordHash, region: u.region, isActive: u.isActive })));

  console.log("--- ACCOUNTS ---");
  const accounts = await db.select().from(accountsTable);
  console.log(accounts.map(a => ({ id: a.id, name: a.name, email: a.email, region: a.region, smtpHost: a.smtpHost, smtpUser: a.smtpUser, smtpPass: a.smtpPass, isActive: a.isActive })));
  
  process.exit(0);
}

check().catch(console.error);
