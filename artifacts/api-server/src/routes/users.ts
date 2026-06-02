import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    region: usersTable.region,
    isActive: usersTable.isActive,
    createdAt: usersTable.createdAt,
    passwordPlain: usersTable.passwordPlain,
    smtpHost: accountsTable.smtpHost,
    smtpPort: accountsTable.smtpPort,
    smtpUser: accountsTable.smtpUser,
    smtpPass: accountsTable.smtpPass,
    dailyLimit: accountsTable.dailyLimit,
  })
  .from(usersTable)
  .leftJoin(accountsTable, eq(usersTable.email, accountsTable.email))
  .orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  console.log("POST /api/users req.body:", req.body);
  const { email, name, password, role, region, smtpHost, smtpPort, smtpUser, smtpPass, dailyLimit } = req.body;
  if (!email || !name || !password) {
    res.status(400).json({ error: "Email, name, and password required" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email,
    name,
    passwordHash,
    passwordPlain: password,
    role: role || "user",
    region: region || null,
  }).returning({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    region: usersTable.region,
    isActive: usersTable.isActive,
    createdAt: usersTable.createdAt,
  });

  if (smtpHost && smtpUser) {
    const existing = await db.select().from(accountsTable).where(eq(accountsTable.smtpUser, smtpUser)).limit(1);
    if (existing[0]) {
      await db.update(accountsTable).set({
        email,
        name,
        region: region || "Global",
        smtpHost,
        smtpPort: smtpPort || 587,
        smtpUser,
        ...(smtpPass ? { smtpPass } : {}),
        dailyLimit: dailyLimit || 500,
        isActive: true,
      }).where(eq(accountsTable.id, existing[0].id));
    } else if (smtpPass) {
      await db.insert(accountsTable).values({
        name,
        email,
        region: region || "Global",
        smtpHost,
        smtpPort: smtpPort || 587,
        smtpUser,
        smtpPass,
        dailyLimit: dailyLimit || 500,
        isActive: true,
      });
    }
  }

  res.status(201).json(user);
});

router.get("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      region: usersTable.region,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      smtpHost: accountsTable.smtpHost,
      smtpPort: accountsTable.smtpPort,
      smtpUser: accountsTable.smtpUser,
      smtpPass: accountsTable.smtpPass,
      dailyLimit: accountsTable.dailyLimit,
    })
    .from(usersTable)
    .leftJoin(accountsTable, eq(usersTable.email, accountsTable.email))
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(rows[0]);
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  console.log("PATCH /api/users/:id req.body:", req.body);
  const id = parseInt(req.params["id"] as string);
  const { name, role, region, isActive, password, smtpHost, smtpPort, smtpUser, smtpPass, dailyLimit } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (region !== undefined) updates.region = region;
  if (isActive !== undefined) updates.isActive = isActive;
  if (password !== undefined) {
    updates.passwordHash = await bcrypt.hash(password, 10);
    updates.passwordPlain = password;
  }
  
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    region: usersTable.region,
    isActive: usersTable.isActive,
    createdAt: usersTable.createdAt,
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (smtpHost !== undefined || smtpUser !== undefined || smtpPass !== undefined || dailyLimit !== undefined) {
    let existing = await db.select().from(accountsTable).where(eq(accountsTable.email, user.email)).limit(1);
    if (!existing[0] && smtpUser) {
      existing = await db.select().from(accountsTable).where(eq(accountsTable.smtpUser, smtpUser)).limit(1);
    }

    if (existing[0]) {
      const accUpdates: Record<string, unknown> = {};
      accUpdates.email = user.email; // Always link/sync the account email with the user's email
      if (name !== undefined) accUpdates.name = name;
      if (region !== undefined) accUpdates.region = region || "Global";
      if (smtpHost !== undefined) accUpdates.smtpHost = smtpHost;
      if (smtpPort !== undefined) accUpdates.smtpPort = smtpPort;
      if (smtpUser !== undefined) accUpdates.smtpUser = smtpUser;
      if (smtpPass !== undefined && smtpPass !== null && smtpPass !== "") accUpdates.smtpPass = smtpPass;
      if (dailyLimit !== undefined) accUpdates.dailyLimit = dailyLimit;
      if (isActive !== undefined) accUpdates.isActive = isActive;

      await db.update(accountsTable).set(accUpdates).where(eq(accountsTable.id, existing[0].id));
    } else if (smtpHost && smtpUser && smtpPass) {
      await db.insert(accountsTable).values({
        name: user.name,
        email: user.email,
        region: user.region || "Global",
        smtpHost,
        smtpPort: smtpPort || 587,
        smtpUser,
        smtpPass,
        dailyLimit: dailyLimit || 500,
        isActive: user.isActive,
      });
    }
  }

  res.json(user);
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const users = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (users[0]) {
    await db.delete(accountsTable).where(eq(accountsTable.email, users[0].email));
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true, message: "User deleted" });
});

export default router;
