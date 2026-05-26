import { Router } from "express";
import nodemailer from "nodemailer";
import { db, accountsTable, templatesTable, emailLogsTable, attachmentsTable } from "@workspace/db";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

function parseRecipients(raw: string): Array<{ email: string; name?: string }> {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(",");
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const email = parts[1].trim();
      return { name, email };
    }
    return { email: line.trim() };
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function classifyError(err: Error): { errorType: "smtp_failed" | "invalid_email" | "blocked" | "limit_reached" | "auth_error" | "unknown"; message: string } {
  const msg = err.message.toLowerCase();
  if (msg.includes("auth") || msg.includes("535") || msg.includes("530")) {
    return { errorType: "auth_error", message: err.message };
  }
  if (msg.includes("limit") || msg.includes("quota") || msg.includes("550 5.7")) {
    return { errorType: "limit_reached", message: err.message };
  }
  if (msg.includes("block") || msg.includes("reject") || msg.includes("spam")) {
    return { errorType: "blocked", message: err.message };
  }
  return { errorType: "smtp_failed", message: err.message };
}

type NmAttachment = { filename: string; content: Buffer; contentType: string };

async function sendEmailWithRetry(
  accountRow: typeof accountsTable.$inferSelect,
  to: { email: string; name?: string },
  subject: string,
  html: string,
  logId: number,
  attachments: NmAttachment[]
) {
  const transporter = nodemailer.createTransport({
    host: accountRow.smtpHost,
    port: accountRow.smtpPort,
    secure: accountRow.smtpPort === 465,
    auth: { user: accountRow.smtpUser, pass: accountRow.smtpPass },
    tls: { rejectUnauthorized: false },
  });

  try {
    await transporter.sendMail({
      from: `"${accountRow.name}" <${accountRow.email}>`,
      to: to.name ? `"${to.name}" <${to.email}>` : to.email,
      subject,
      html,
      attachments,
    });
    await db.update(emailLogsTable).set({ status: "sent", sentAt: new Date() }).where(eq(emailLogsTable.id, logId));
    await db.update(accountsTable).set({ sentToday: sql`${accountsTable.sentToday} + 1` }).where(eq(accountsTable.id, accountRow.id));
    logger.info({ logId, email: to.email }, "Email sent");
  } catch (err: unknown) {
    const error = err as Error;
    const { errorType, message } = classifyError(error);
    await db.update(emailLogsTable).set({ status: "failed", errorType, errorMessage: message }).where(eq(emailLogsTable.id, logId));
    logger.error({ logId, email: to.email, errorType, message }, "Email failed");
  }
}

async function getActiveAttachments(): Promise<NmAttachment[]> {
  const rows = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.isActive, true));
  return rows.map(r => ({
    filename: r.filename,
    content: Buffer.from(r.content, "base64"),
    contentType: r.mimeType,
  }));
}

router.post("/emails/send", requireAuth, async (req, res) => {
  const { accountId, templateId, recipients, subject, htmlContent, delaySeconds } = req.body;
  if (!accountId || !templateId || !recipients || !subject) {
    res.status(400).json({ error: "accountId, templateId, recipients, subject required" });
    return;
  }

  const accounts = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
  const account = accounts[0];
  if (!account || !account.isActive) {
    res.status(400).json({ error: "Account not found or inactive" });
    return;
  }

  const templates = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId)).limit(1);
  const template = templates[0];
  if (!template) {
    res.status(400).json({ error: "Template not found" });
    return;
  }

  const parsed = parseRecipients(recipients);
  const valid = parsed.filter(r => isValidEmail(r.email));

  if (valid.length === 0) {
    res.status(400).json({ error: "No valid email addresses found" });
    return;
  }

  const logInserts = valid.map(r => ({
    accountId,
    templateId,
    recipientEmail: r.email,
    recipientName: r.name || null,
    subject,
    status: "pending" as const,
  }));

  const inserted = await db.insert(emailLogsTable).values(logInserts).returning({ id: emailLogsTable.id });

  res.json({ queued: inserted.length, recipients: valid.length, message: `${inserted.length} emails queued for sending` });

  const delay = Math.min(delaySeconds || 0, 60) * 1000;
  const htmlToSend = htmlContent || template.htmlContent;

  setImmediate(async () => {
    const attachments = await getActiveAttachments();
    for (let i = 0; i < valid.length; i++) {
      const recipient = valid[i];
      const logId = inserted[i].id;
      await sendEmailWithRetry(account, recipient, subject, htmlToSend, logId, attachments);
      if (delay > 0 && i < valid.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  });
});

router.get("/emails/history", requireAuth, async (req, res) => {
  const { accountId, status, dateFrom, dateTo, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 50, 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (accountId) conditions.push(eq(emailLogsTable.accountId, parseInt(accountId)));
  if (status && ["sent", "failed", "pending"].includes(status)) {
    conditions.push(eq(emailLogsTable.status, status as "sent" | "failed" | "pending"));
  }
  if (dateFrom) conditions.push(gte(emailLogsTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(emailLogsTable.createdAt, new Date(dateTo)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, rows] = await Promise.all([
    db.select({ count: count() }).from(emailLogsTable).where(whereClause),
    db
      .select({
        id: emailLogsTable.id,
        accountId: emailLogsTable.accountId,
        accountName: accountsTable.name,
        recipientEmail: emailLogsTable.recipientEmail,
        recipientName: emailLogsTable.recipientName,
        subject: emailLogsTable.subject,
        status: emailLogsTable.status,
        errorMessage: emailLogsTable.errorMessage,
        sentAt: emailLogsTable.sentAt,
        createdAt: emailLogsTable.createdAt,
      })
      .from(emailLogsTable)
      .leftJoin(accountsTable, eq(emailLogsTable.accountId, accountsTable.id))
      .where(whereClause)
      .orderBy(sql`${emailLogsTable.createdAt} desc`)
      .limit(limitNum)
      .offset(offset),
  ]);

  res.json({
    data: rows,
    total: totalResult[0]?.count ?? 0,
    page: pageNum,
    limit: limitNum,
  });
});

router.post("/emails/history/:id/retry", requireAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const logs = await db
    .select()
    .from(emailLogsTable)
    .leftJoin(accountsTable, eq(emailLogsTable.accountId, accountsTable.id))
    .where(and(eq(emailLogsTable.id, id), eq(emailLogsTable.status, "failed")))
    .limit(1);

  if (!logs[0]) {
    res.status(404).json({ error: "Email log not found or not failed" });
    return;
  }

  const logRow = logs[0].email_logs;
  const accountRow = logs[0].accounts;

  if (!accountRow) {
    res.status(400).json({ error: "Account not found" });
    return;
  }

  await db.update(emailLogsTable).set({ status: "pending", errorMessage: null, errorType: null }).where(eq(emailLogsTable.id, id));

  res.json({ success: true, message: "Retry queued" });

  const template = logRow.templateId
    ? await db.select().from(templatesTable).where(eq(templatesTable.id, logRow.templateId)).limit(1).then(r => r[0])
    : null;
  const html = template?.htmlContent || "<p>Retry email</p>";

  setImmediate(async () => {
    const attachments = await getActiveAttachments();
    await sendEmailWithRetry(accountRow, { email: logRow.recipientEmail, name: logRow.recipientName || undefined }, logRow.subject, html, id, attachments);
  });
});

router.get("/emails/queue", requireAuth, async (req, res) => {
  const [pending] = await Promise.all([
    db.select({ count: count() }).from(emailLogsTable).where(eq(emailLogsTable.status, "pending")),
  ]);
  const pendingCount = Number(pending[0]?.count ?? 0);
  res.json({ pending: pendingCount, processing: 0, total: pendingCount });
});

export default router;
