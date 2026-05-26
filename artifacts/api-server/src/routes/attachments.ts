import { Router } from "express";
import { db, attachmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/attachments", requireAuth, async (_req, res) => {
  const rows = await db
    .select({
      id: attachmentsTable.id,
      name: attachmentsTable.name,
      filename: attachmentsTable.filename,
      mimeType: attachmentsTable.mimeType,
      isActive: attachmentsTable.isActive,
      createdAt: attachmentsTable.createdAt,
    })
    .from(attachmentsTable)
    .orderBy(attachmentsTable.createdAt);
  res.json(rows);
});

router.post("/attachments", requireAuth, requireAdmin, async (req, res) => {
  const { name, filename, mimeType, content, isActive } = req.body;
  if (!name || !filename || !mimeType || !content) {
    res.status(400).json({ error: "name, filename, mimeType, content are required" });
    return;
  }
  const [row] = await db
    .insert(attachmentsTable)
    .values({ name, filename, mimeType, content, isActive: isActive !== false })
    .returning({
      id: attachmentsTable.id,
      name: attachmentsTable.name,
      filename: attachmentsTable.filename,
      mimeType: attachmentsTable.mimeType,
      isActive: attachmentsTable.isActive,
      createdAt: attachmentsTable.createdAt,
    });
  res.status(201).json(row);
});

router.patch("/attachments/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const { name, isActive } = req.body;
  const updates: Partial<{ name: string; isActive: boolean }> = {};
  if (name !== undefined) updates.name = name;
  if (isActive !== undefined) updates.isActive = isActive;
  const [row] = await db
    .update(attachmentsTable)
    .set(updates)
    .where(eq(attachmentsTable.id, id))
    .returning({
      id: attachmentsTable.id,
      name: attachmentsTable.name,
      filename: attachmentsTable.filename,
      mimeType: attachmentsTable.mimeType,
      isActive: attachmentsTable.isActive,
      createdAt: attachmentsTable.createdAt,
    });
  if (!row) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  res.json(row);
});

router.delete("/attachments/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  await db.delete(attachmentsTable).where(eq(attachmentsTable.id, id));
  res.json({ success: true, message: "Attachment deleted" });
});

export default router;
