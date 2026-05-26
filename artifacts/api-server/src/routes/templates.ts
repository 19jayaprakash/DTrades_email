import { Router } from "express";
import { db, templatesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/templates", requireAuth, async (req, res) => {
  const templates = await db.select().from(templatesTable).orderBy(templatesTable.name);
  res.json(templates);
});

router.post("/templates", requireAuth, requireAdmin, async (req, res) => {
  const { name, subject, htmlContent, textContent, category, variables } = req.body;
  if (!name || !subject || !htmlContent) {
    res.status(400).json({ error: "Name, subject, and htmlContent required" });
    return;
  }
  const [template] = await db.insert(templatesTable).values({
    name,
    subject,
    htmlContent,
    textContent: textContent || null,
    category: category || null,
    variables: variables || [],
  }).returning();
  res.status(201).json(template);
});

router.get("/templates/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const templates = await db.select().from(templatesTable).where(eq(templatesTable.id, id)).limit(1);
  if (!templates[0]) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(templates[0]);
});

router.patch("/templates/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const { name, subject, htmlContent, textContent, category, variables } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (subject !== undefined) updates.subject = subject;
  if (htmlContent !== undefined) updates.htmlContent = htmlContent;
  if (textContent !== undefined) updates.textContent = textContent;
  if (category !== undefined) updates.category = category;
  if (variables !== undefined) updates.variables = variables;
  const [template] = await db.update(templatesTable).set(updates).where(eq(templatesTable.id, id)).returning();
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(template);
});

router.delete("/templates/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  await db.delete(templatesTable).where(eq(templatesTable.id, id));
  res.json({ success: true, message: "Template deleted" });
});

export default router;
