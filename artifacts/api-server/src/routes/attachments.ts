import { Router } from "express";
import { db, attachmentsTable, userAttachmentsTable, attachmentContentsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { compressContent, decompressContent } from "../lib/compression";

const router = Router();

router.get("/attachments", requireAuth, async (req, res) => {
  const reqUser = (req as any).user;
  const isAdmin = reqUser?.role === "admin";
  const userIdQuery = req.query["userId"] ? parseInt(req.query["userId"] as string) : null;

  if (!isAdmin) {
    // Standard user can only list attachments assigned to them
    const rows = await db
      .select({
        id: attachmentsTable.id,
        userId: attachmentsTable.userId,
        type: attachmentsTable.type,
        name: attachmentsTable.name,
        filename: attachmentsTable.filename,
        mimeType: attachmentsTable.mimeType,
        isActive: attachmentsTable.isActive,
        content: sql<string | null>`CASE WHEN ${attachmentsTable.type} IN ('signature', 'signature_banner') THEN ${attachmentContentsTable.content} ELSE NULL END`,
        sizeBytes: sql<number | null>`LENGTH(${attachmentContentsTable.content})`,
        createdAt: attachmentsTable.createdAt,
      })
      .from(attachmentsTable)
      .leftJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .innerJoin(userAttachmentsTable, eq(userAttachmentsTable.attachmentId, attachmentsTable.id))
      .where(and(eq(userAttachmentsTable.userId, reqUser.id), eq(attachmentsTable.isActive, true)))
      .orderBy(attachmentsTable.createdAt);
    res.json(rows.map(r => ({ ...r, content: decompressContent(r.content) })));
    return;
  }

  // Admin perspective
  if (userIdQuery) {
    // If querying specific user's assigned attachments
    const rows = await db
      .select({
        id: attachmentsTable.id,
        userId: attachmentsTable.userId,
        type: attachmentsTable.type,
        name: attachmentsTable.name,
        filename: attachmentsTable.filename,
        mimeType: attachmentsTable.mimeType,
        isActive: attachmentsTable.isActive,
        content: sql<string | null>`CASE WHEN ${attachmentsTable.type} IN ('signature', 'signature_banner') THEN ${attachmentContentsTable.content} ELSE NULL END`,
        sizeBytes: sql<number | null>`LENGTH(${attachmentContentsTable.content})`,
        createdAt: attachmentsTable.createdAt,
      })
      .from(attachmentsTable)
      .leftJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .innerJoin(userAttachmentsTable, eq(userAttachmentsTable.attachmentId, attachmentsTable.id))
      .where(eq(userAttachmentsTable.userId, userIdQuery))
      .orderBy(attachmentsTable.createdAt);
    res.json(rows.map(r => ({ ...r, content: decompressContent(r.content) })));
    return;
  }

  // General listing of all documents
  const attachments = await db
    .select({
      id: attachmentsTable.id,
      userId: attachmentsTable.userId,
      type: attachmentsTable.type,
      name: attachmentsTable.name,
      filename: attachmentsTable.filename,
      mimeType: attachmentsTable.mimeType,
      isActive: attachmentsTable.isActive,
      content: sql<string | null>`CASE WHEN ${attachmentsTable.type} IN ('signature', 'signature_banner') THEN ${attachmentContentsTable.content} ELSE NULL END`,
      sizeBytes: sql<number | null>`LENGTH(${attachmentContentsTable.content})`,
      createdAt: attachmentsTable.createdAt,
    })
    .from(attachmentsTable)
    .leftJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
    .orderBy(attachmentsTable.createdAt);

  const assignments = await db.select().from(userAttachmentsTable);

  const rows = attachments.map(att => {
    const assignedUserIds = assignments
      .filter(a => a.attachmentId === att.id)
      .map(a => a.userId);
    return {
      ...att,
      content: decompressContent(att.content),
      assignedUserIds,
    };
  });

  res.json(rows);
});

router.post("/attachments", requireAuth, requireAdmin, async (req, res) => {
  const { name, filename, mimeType, content, isActive, type, assignedUserIds } = req.body;
  if (!name || !filename || !mimeType || !content) {
    res.status(400).json({ error: "name, filename, mimeType, content are required" });
    return;
  }

  // Enforce 50MB binary limit (approx 70MB base64 string length)
  if (content.length > 70 * 1024 * 1024) {
    res.status(400).json({ error: "File too large. Maximum size allowed is 50MB." });
    return;
  }

  const [row] = await db
    .insert(attachmentsTable)
    .values({ 
      userId: (req as any).user.id,
      name, 
      filename, 
      mimeType, 
      type: type || "catalog",
      isActive: isActive !== false 
    })
    .returning({
      id: attachmentsTable.id,
      userId: attachmentsTable.userId,
      type: attachmentsTable.type,
      name: attachmentsTable.name,
      filename: attachmentsTable.filename,
      mimeType: attachmentsTable.mimeType,
      isActive: attachmentsTable.isActive,
      createdAt: attachmentsTable.createdAt,
    });

  const compressedContent = compressContent(content);
  await db.insert(attachmentContentsTable).values({
    attachmentId: row.id,
    content: compressedContent,
  });

  if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
    await db.insert(userAttachmentsTable).values(
      assignedUserIds.map((uId: number) => ({
        userId: uId,
        attachmentId: row.id,
      }))
    );
  }

  res.status(201).json({
    ...row,
    content,
    assignedUserIds: assignedUserIds || [],
  });
});

router.patch("/attachments/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const { name, isActive, content, assignedUserIds } = req.body;
  const updates: Partial<{ name: string; isActive: boolean }> = {};
  if (name !== undefined) updates.name = name;
  if (isActive !== undefined) updates.isActive = isActive;

  let row;
  if (Object.keys(updates).length > 0) {
    const [updatedRow] = await db
      .update(attachmentsTable)
      .set(updates)
      .where(eq(attachmentsTable.id, id))
      .returning({
        id: attachmentsTable.id,
        userId: attachmentsTable.userId,
        type: attachmentsTable.type,
        name: attachmentsTable.name,
        filename: attachmentsTable.filename,
        mimeType: attachmentsTable.mimeType,
        isActive: attachmentsTable.isActive,
        createdAt: attachmentsTable.createdAt,
      });
    row = updatedRow;
  } else {
    const [fetched] = await db
      .select({
        id: attachmentsTable.id,
        userId: attachmentsTable.userId,
        type: attachmentsTable.type,
        name: attachmentsTable.name,
        filename: attachmentsTable.filename,
        mimeType: attachmentsTable.mimeType,
        isActive: attachmentsTable.isActive,
        createdAt: attachmentsTable.createdAt,
      })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, id))
      .limit(1);
    row = fetched;
  }

  if (!row) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  if (content !== undefined) {
    const compressedContent = compressContent(content);
    const [existingContent] = await db
      .select({ attachmentId: attachmentContentsTable.attachmentId })
      .from(attachmentContentsTable)
      .where(eq(attachmentContentsTable.attachmentId, id))
      .limit(1);
    if (existingContent) {
      await db
        .update(attachmentContentsTable)
        .set({ content: compressedContent })
        .where(eq(attachmentContentsTable.attachmentId, id));
    } else {
      await db
        .insert(attachmentContentsTable)
        .values({ attachmentId: id, content: compressedContent });
    }
  }

  if (assignedUserIds !== undefined && Array.isArray(assignedUserIds)) {
    // Delete existing assignments and recreate them
    await db.delete(userAttachmentsTable).where(eq(userAttachmentsTable.attachmentId, id));
    if (assignedUserIds.length > 0) {
      await db.insert(userAttachmentsTable).values(
        assignedUserIds.map((uId: number) => ({
          userId: uId,
          attachmentId: id,
        }))
      );
    }
  }

  const currentAssignments = await db
    .select()
    .from(userAttachmentsTable)
    .where(eq(userAttachmentsTable.attachmentId, id));

  res.json({
    ...row,
    content: content !== undefined ? content : undefined,
    assignedUserIds: currentAssignments.map(a => a.userId),
  });
});

router.delete("/attachments/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  await db.delete(attachmentsTable).where(eq(attachmentsTable.id, id));
  res.json({ success: true, message: "Attachment deleted" });
});

export default router;

