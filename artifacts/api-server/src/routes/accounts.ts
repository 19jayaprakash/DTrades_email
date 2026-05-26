import { Router } from "express";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

const safeAccount = (a: typeof accountsTable.$inferSelect) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  region: a.region,
  smtpHost: a.smtpHost,
  smtpPort: a.smtpPort,
  smtpUser: a.smtpUser,
  isActive: a.isActive,
  dailyLimit: a.dailyLimit,
  sentToday: a.sentToday,
  createdAt: a.createdAt,
});

router.get("/accounts", requireAuth, async (req, res) => {
  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.name);
  res.json(accounts.map(safeAccount));
});

router.post("/accounts", requireAuth, requireAdmin, async (req, res) => {
  const { name, email, region, smtpHost, smtpPort, smtpUser, smtpPass, dailyLimit } = req.body;
  if (!name || !email || !region || !smtpHost || !smtpUser || !smtpPass) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [account] = await db.insert(accountsTable).values({
    name,
    email,
    region,
    smtpHost,
    smtpPort: smtpPort || 587,
    smtpUser,
    smtpPass,
    dailyLimit: dailyLimit || 500,
  }).returning();
  res.status(201).json(safeAccount(account));
});

router.get("/accounts/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const accounts = await db.select().from(accountsTable).where(eq(accountsTable.id, id)).limit(1);
  if (!accounts[0]) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(safeAccount(accounts[0]));
});

router.patch("/accounts/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const { name, email, region, smtpHost, smtpPort, smtpUser, smtpPass, isActive, dailyLimit } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (region !== undefined) updates.region = region;
  if (smtpHost !== undefined) updates.smtpHost = smtpHost;
  if (smtpPort !== undefined) updates.smtpPort = smtpPort;
  if (smtpUser !== undefined) updates.smtpUser = smtpUser;
  if (smtpPass !== undefined) updates.smtpPass = smtpPass;
  if (isActive !== undefined) updates.isActive = isActive;
  if (dailyLimit !== undefined) updates.dailyLimit = dailyLimit;
  const [account] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(safeAccount(account));
});

router.delete("/accounts/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  await db.delete(accountsTable).where(eq(accountsTable.id, id));
  res.json({ success: true, message: "Account deleted" });
});

export default router;
