import { Router } from "express";
import nodemailer from "nodemailer";
import { db, accountsTable, templatesTable, emailLogsTable, attachmentsTable, userAttachmentsTable, attachmentContentsTable } from "@workspace/db";
import { eq, and, gte, lte, count, sql, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { sendViaGmailApi, isGmailApiAvailable } from "../lib/gmail-sender";
import path from "path";
import fs from "fs";
import { decompressContent } from "../lib/compression";

const router = Router();

// Gmail size limit: 25MB. We stay safely under at 24.5MB total mail size.
const MAX_EMAIL_SIZE_BYTES = 24.5 * 1024 * 1024;

// Max concurrent SMTP sends per batch (set to 1 to prevent OOM on 512MB RAM containers)
const SEND_CONCURRENCY = 1;

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
  if (msg.includes("552") || msg.includes("size") || msg.includes("maxsize") || msg.includes("message size") || msg.includes("too large")) {
    return { errorType: "limit_reached", message: "Email too large for Gmail (25MB limit). Remove large attachments." };
  }
  if (msg.includes("limit") || msg.includes("quota") || msg.includes("550 5.7")) {
    return { errorType: "limit_reached", message: err.message };
  }
  if (msg.includes("block") || msg.includes("reject") || msg.includes("spam")) {
    return { errorType: "blocked", message: err.message };
  }
  return { errorType: "smtp_failed", message: err.message };
}

/** Run up to `concurrency` async tasks at a time */
async function pMap<T>(items: T[], fn: (item: T, index: number) => Promise<void>, concurrency: number): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

type NmAttachment = { filename: string; content: Buffer; contentType: string; originalSize?: number };

const transporterCache = new Map<number, nodemailer.Transporter>();

function getTransporter(accountRow: typeof accountsTable.$inferSelect): nodemailer.Transporter {
  let transporter = transporterCache.get(accountRow.id);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      host: accountRow.smtpHost,
      port: accountRow.smtpPort,
      secure: accountRow.smtpPort === 465,
      auth: { user: accountRow.smtpUser, pass: accountRow.smtpPass },
      tls: { rejectUnauthorized: false },
    });
    transporterCache.set(accountRow.id, transporter);
  }
  return transporter;
}

/** Estimate total mail size in bytes (HTML + all attachments) */
function estimateMailSize(html: string, attachments: NmAttachment[]): number {
  const htmlSize = Buffer.byteLength(html, "utf-8");
  const attachSize = attachments.reduce((sum, a) => sum + (a.originalSize ?? a.content.length), 0);
  // MIME encoding overhead ~37%
  return Math.round((htmlSize + attachSize) * 1.37);
}

async function sendEmailWithRetry(
  accountRow: typeof accountsTable.$inferSelect,
  to: { email: string; name?: string },
  subject: string,
  html: string,
  logId: number,
  attachments: NmAttachment[],
  globalSignatureHtml: string | null,
  customBannerRow: { filename: string; content: Buffer; mimeType: string } | null
) {
  const transporter = getTransporter(accountRow);

  const signatureBannerCid = "signature_banner_image";

  const signatureHtml = accountRow.signature
    ? `<br><br><div style="font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.5; margin-top: 20px;">${accountRow.signature}</div>`
    : (globalSignatureHtml || `
      <br><br>
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.5; margin-top: 20px;">
        <p style="margin: 0 0 4px; color: #555555;">Warm regards,</p>
        <p style="margin: 0 0 4px; font-weight: bold; color: #2d2d2d; font-size: 16px;">Dhivya Kunarajah</p>
        <p style="margin: 0 0 12px; font-weight: bold; color: #c47a1b; font-size: 14px;">Founder, D Trades</p>
        <p style="margin: 0 0 4px; color: #555555; font-size: 13px;">📞 +91 7708194433</p>
        <p style="margin: 0 0 4px; color: #555555; font-size: 13px;">🌐 <a href="https://dtradesinternational.in" target="_blank" style="color: #c47a1b; text-decoration: none;">dtradesinternational.in</a></p>
        <p style="margin: 0 0 16px; color: #555555; font-size: 13px;">✉️ <a href="mailto:dtradesinternational@gmail.com" style="color: #c47a1b; text-decoration: none;">dtradesinternational@gmail.com</a></p>
        <div style="margin-top: 15px;">
          <img src="cid:${signatureBannerCid}" alt="D Trades Spices & Ingredients" style="width: 100%; max-width: 600px; display: block;" />
        </div>
      </div>
    `);

  let htmlWithSignature = html;
  const signatureCheckToken = accountRow.signature ? "div style=" : "Dhivya Kunarajah";
  if (!html.includes(signatureCheckToken)) {
    if (html.includes("</div></body></html>")) {
      htmlWithSignature = html.replace("</div></body></html>", `${signatureHtml}</div></body></html>`);
    } else if (html.includes("</body></html>")) {
      htmlWithSignature = html.replace("</body></html>", `${signatureHtml}</body></html>`);
    } else {
      htmlWithSignature = html + signatureHtml;
    }
  }

  const mailAttachments = [...attachments];
  if (!accountRow.signature) {
    if (customBannerRow) {
      mailAttachments.push({
        filename: customBannerRow.filename,
        content: customBannerRow.content,
        contentType: customBannerRow.mimeType,
        cid: signatureBannerCid
      } as any);
    } else {
      let bannerPath = path.join(__dirname, "../../../email-crm/public/export_masala.png");
      if (!fs.existsSync(bannerPath)) {
        bannerPath = path.join(process.cwd(), "artifacts/email-crm/public/export_masala.png");
      }
      if (fs.existsSync(bannerPath)) {
        mailAttachments.push({
          filename: "signature_banner.png",
          content: fs.readFileSync(bannerPath),
          contentType: "image/png",
          cid: signatureBannerCid
        } as any);
      }
    }
  }

  // ── Size guard: skip email if total exceeds Gmail limit ──────────────────
  const estimatedSize = estimateMailSize(htmlWithSignature, attachments);
  if (estimatedSize > MAX_EMAIL_SIZE_BYTES) {
    const sizeMsg = `Email too large (~${Math.round(estimatedSize / 1024 / 1024)}MB). Gmail limit is 25MB. Remove large attachments.`;
    await db.update(emailLogsTable).set({ 
      status: "failed", 
      errorType: "limit_reached", 
      errorMessage: sizeMsg,
      errorDetails: JSON.stringify({
        estimatedSize,
        attachmentCount: mailAttachments.length,
        attachments: mailAttachments.map(a => ({ filename: (a as any).filename, contentType: (a as any).contentType, size: (a as any).originalSize ?? (a as any).content?.length }))
      }, null, 2)
    }).where(eq(emailLogsTable.id, logId));
    logger.warn({ logId, email: to.email, estimatedSize }, "Skipped: email too large");
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const toAddress = to.name ? `"${to.name}" <${to.email}>` : to.email;
  const textFallback = htmlWithSignature.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

  try {
    if (isGmailApiAvailable()) {
      // ── Gmail API path (fast, no SMTP connection overhead) ────────────────
      await sendViaGmailApi({
        fromEmail: accountRow.email,
        fromName: accountRow.name,
        to: toAddress,
        subject,
        html: htmlWithSignature,
        text: textFallback,
        attachments: mailAttachments.map(a => ({
          filename: (a as any).filename,
          content: (a as any).content,
          contentType: (a as any).contentType || (a as any).mimeType,
          cid: (a as any).cid,
        })),
      } as any);
    } else {
      // ── SMTP fallback ──────────────────────────────────────────────────────
      const transporter = getTransporter(accountRow);
      await transporter.sendMail({
        from: `"${accountRow.name}" <${accountRow.email}>`,
        to: toAddress,
        subject,
        html: htmlWithSignature,
        text: textFallback,
        attachments: mailAttachments,
      });
    }
    await db.update(emailLogsTable).set({ status: "sent", sentAt: new Date() }).where(eq(emailLogsTable.id, logId));
    await db.update(accountsTable).set({ sentToday: sql`${accountsTable.sentToday} + 1` }).where(eq(accountsTable.id, accountRow.id));
    logger.info({ logId, email: to.email, method: isGmailApiAvailable() ? "gmail-api" : "smtp" }, "Email sent");
  } catch (err: unknown) {
    const error = err as Error;
    const { errorType, message } = classifyError(error);
    await db.update(emailLogsTable).set({ 
      status: "failed", 
      errorType, 
      errorMessage: message,
      errorDetails: JSON.stringify({
        rawError: error.message,
        stack: error.stack,
        method: isGmailApiAvailable() ? "gmail-api" : "smtp",
        attachmentCount: mailAttachments.length,
        attachments: mailAttachments.map(a => ({ filename: (a as any).filename, contentType: (a as any).contentType, size: (a as any).originalSize ?? (a as any).content?.length }))
      }, null, 2)
    }).where(eq(emailLogsTable.id, logId));
    logger.error({ logId, email: to.email, errorType, message }, "Email failed");
  }
}

async function getUserAttachments(userId: number, selectedCatalogIds?: number[]): Promise<NmAttachment[]> {
  // Always fetch terms assigned to this user
  const termsRows = await db
    .select({
      filename: attachmentsTable.filename,
      content: attachmentContentsTable.content,
      mimeType: attachmentsTable.mimeType,
    })
    .from(attachmentsTable)
    .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
    .innerJoin(userAttachmentsTable, eq(userAttachmentsTable.attachmentId, attachmentsTable.id))
    .where(
      and(
        eq(userAttachmentsTable.userId, userId),
        eq(attachmentsTable.isActive, true),
        eq(attachmentsTable.type, "terms")
      )
    );

  const result: NmAttachment[] = [];
  for (const r of termsRows) {
    const decompressed = decompressContent(r.content) || "";
    if (decompressed.startsWith("http://") || decompressed.startsWith("https://")) {
      try {
        const res = await fetch(decompressed);
        const lenStr = res.headers.get("content-length");
        const size = lenStr ? parseInt(lenStr, 10) : 0;
        if (size > MAX_EMAIL_SIZE_BYTES) {
          result.push({ filename: r.filename, content: Buffer.alloc(0), contentType: r.mimeType, originalSize: size });
          continue;
        }
        const arrBuf = await res.arrayBuffer();
        result.push({
          filename: r.filename,
          content: Buffer.from(arrBuf),
          contentType: r.mimeType,
        });
      } catch (e) {
        logger.error({ err: e, url: decompressed }, "Error fetching terms attachment from URL");
      }
    } else {
      const approxSize = Math.round(decompressed.length * 0.75);
      if (approxSize > MAX_EMAIL_SIZE_BYTES) {
        result.push({ filename: r.filename, content: Buffer.alloc(0), contentType: r.mimeType, originalSize: approxSize });
        continue;
      }
      result.push({
        filename: r.filename,
        content: Buffer.from(decompressed, "base64"),
        contentType: r.mimeType,
      });
    }
  }

  // Fetch the selected catalogs separately (if any)
  if (selectedCatalogIds && selectedCatalogIds.length > 0) {
    const catalogRows = await db
      .select({
        filename: attachmentsTable.filename,
        content: attachmentContentsTable.content,
        mimeType: attachmentsTable.mimeType,
      })
      .from(attachmentsTable)
      .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .innerJoin(userAttachmentsTable, eq(userAttachmentsTable.attachmentId, attachmentsTable.id))
      .where(
        and(
          eq(userAttachmentsTable.userId, userId),
          eq(attachmentsTable.isActive, true),
          inArray(attachmentsTable.id, selectedCatalogIds)
        )
      );

    for (const r of catalogRows) {
      const decompressed = decompressContent(r.content) || "";
      if (decompressed.startsWith("http://") || decompressed.startsWith("https://")) {
        try {
          const res = await fetch(decompressed);
          const lenStr = res.headers.get("content-length");
          const size = lenStr ? parseInt(lenStr, 10) : 0;
          if (size > MAX_EMAIL_SIZE_BYTES) {
            result.push({ filename: r.filename, content: Buffer.alloc(0), contentType: r.mimeType, originalSize: size });
            continue;
          }
          const arrBuf = await res.arrayBuffer();
          result.push({
            filename: r.filename,
            content: Buffer.from(arrBuf),
            contentType: r.mimeType,
          });
        } catch (e) {
          logger.error({ err: e, url: decompressed }, "Error fetching catalog attachment from URL");
        }
      } else {
        const approxSize = Math.round(decompressed.length * 0.75);
        if (approxSize > MAX_EMAIL_SIZE_BYTES) {
          result.push({ filename: r.filename, content: Buffer.alloc(0), contentType: r.mimeType, originalSize: approxSize });
          continue;
        }
        result.push({
          filename: r.filename,
          content: Buffer.from(decompressed, "base64"),
          contentType: r.mimeType,
        });
      }
    }
  }

  return result;
}

router.post("/emails/send", requireAuth, async (req, res) => {
  const { accountId, templateId, recipients, subject, htmlContent, delaySeconds, selectedCatalogIds } = req.body;
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

  const catalogIdsArray = Array.isArray(selectedCatalogIds) 
    ? selectedCatalogIds 
    : (req.body.selectedCatalogId ? [req.body.selectedCatalogId] : null);

  const logInserts = valid.map(r => ({
    accountId,
    templateId,
    recipientEmail: r.email,
    recipientName: r.name || null,
    subject,
    status: "pending" as const,
    selectedCatalogIds: catalogIdsArray,
  }));

  const inserted = await db.insert(emailLogsTable).values(logInserts).returning({ id: emailLogsTable.id });

  res.json({ queued: inserted.length, recipients: valid.length, message: `${inserted.length} emails queued for sending` });

  const sendingUserId = (req as any).user?.id as number;
  const delay = Math.min(delaySeconds || 0, 60) * 1000;
  const htmlToSend = htmlContent || template.htmlContent;

  // Fetch signature + banner ONCE for the entire batch
  let globalSignatureHtml = null;
  try {
    const [sigRow] = await db
      .select({ content: attachmentContentsTable.content })
      .from(attachmentsTable)
      .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .where(and(eq(attachmentsTable.type, "signature"), eq(attachmentsTable.isActive, true)))
      .limit(1);
    if (sigRow) {
      const decompressed = decompressContent(sigRow.content) || "";
      globalSignatureHtml = Buffer.from(decompressed, "base64").toString("utf-8");
    }
  } catch (e) {
    logger.error({ err: e }, "Error fetching global signature");
  }

  let customBannerRow: { filename: string; content: Buffer; mimeType: string } | null = null;
  try {
    const [bannerRow] = await db
      .select({
        filename: attachmentsTable.filename,
        content: attachmentContentsTable.content,
        mimeType: attachmentsTable.mimeType,
      })
      .from(attachmentsTable)
      .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .where(and(eq(attachmentsTable.type, "signature_banner"), eq(attachmentsTable.isActive, true)))
      .limit(1);
    if (bannerRow) {
      let contentBuffer: Buffer;
      const contentStr = decompressContent(bannerRow.content) || "";
      if (contentStr.startsWith("http://") || contentStr.startsWith("https://")) {
        const res = await fetch(contentStr);
        const arrBuf = await res.arrayBuffer();
        contentBuffer = Buffer.from(arrBuf);
      } else {
        contentBuffer = Buffer.from(contentStr, "base64");
      }
      customBannerRow = {
        filename: bannerRow.filename,
        content: contentBuffer,
        mimeType: bannerRow.mimeType,
      };
    }
  } catch (e) {
    logger.error({ err: e }, "Error fetching custom signature banner");
  }

  setImmediate(async () => {
    const attachments = await getUserAttachments(sendingUserId, catalogIdsArray || undefined);

    if (delay > 0) {
      // Sequential with delay between sends
      for (let i = 0; i < valid.length; i++) {
        const recipient = valid[i];
        const logId = inserted[i].id;
        await sendEmailWithRetry(account, recipient, subject, htmlToSend, logId, attachments, globalSignatureHtml, customBannerRow);
        if (i < valid.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } else {
      // Concurrent sends — SEND_CONCURRENCY at a time (fast but controlled)
      await pMap(
        valid,
        async (recipient, i) => {
          const logId = inserted[i].id;
          await sendEmailWithRetry(account, recipient, subject, htmlToSend, logId, attachments, globalSignatureHtml, customBannerRow);
        },
        SEND_CONCURRENCY
      );
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
        errorType: emailLogsTable.errorType,
        errorMessage: emailLogsTable.errorMessage,
        errorDetails: emailLogsTable.errorDetails,
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

  await db.update(emailLogsTable).set({ 
    status: "pending", 
    errorMessage: null, 
    errorType: null 
  }).where(eq(emailLogsTable.id, id));

  res.json({ success: true, message: "Retry queued" });

  const retryUserId = (req as any).user?.id as number;
  const template = logRow.templateId
    ? await db.select().from(templatesTable).where(eq(templatesTable.id, logRow.templateId)).limit(1).then(r => r[0])
    : null;
  let html = template?.htmlContent || "<p>Retry email</p>";
  
  if (logRow.recipientName) {
    html = html.replace(/\{\{\s*name\s*\}\}/g, logRow.recipientName);
  }

  let globalSignatureHtml = null;
  try {
    const [sigRow] = await db
      .select({ content: attachmentContentsTable.content })
      .from(attachmentsTable)
      .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .where(and(eq(attachmentsTable.type, "signature"), eq(attachmentsTable.isActive, true)))
      .limit(1);
    if (sigRow) {
      const decompressed = decompressContent(sigRow.content) || "";
      globalSignatureHtml = Buffer.from(decompressed, "base64").toString("utf-8");
    }
  } catch (e) {
    logger.error({ err: e }, "Error fetching global signature");
  }

  let customBannerRow: { filename: string; content: Buffer; mimeType: string } | null = null;
  try {
    const [bannerRow] = await db
      .select({
        filename: attachmentsTable.filename,
        content: attachmentContentsTable.content,
        mimeType: attachmentsTable.mimeType,
      })
      .from(attachmentsTable)
      .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .where(and(eq(attachmentsTable.type, "signature_banner"), eq(attachmentsTable.isActive, true)))
      .limit(1);
    if (bannerRow) {
      let contentBuffer: Buffer;
      const contentStr = decompressContent(bannerRow.content) || "";
      if (contentStr.startsWith("http://") || contentStr.startsWith("https://")) {
        const res = await fetch(contentStr);
        const arrBuf = await res.arrayBuffer();
        contentBuffer = Buffer.from(arrBuf);
      } else {
        contentBuffer = Buffer.from(contentStr, "base64");
      }
      customBannerRow = {
        filename: bannerRow.filename,
        content: contentBuffer,
        mimeType: bannerRow.mimeType,
      };
    }
  } catch (e) {
    logger.error({ err: e }, "Error fetching custom signature banner");
  }

  setImmediate(async () => {
    const attachments = await getUserAttachments(retryUserId);
    await sendEmailWithRetry(accountRow, { email: logRow.recipientEmail, name: logRow.recipientName || undefined }, logRow.subject, html, id, attachments, globalSignatureHtml, customBannerRow);
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
