import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { db, usersTable, emailLogsTable, accountsTable, templatesTable, attachmentsTable, userAttachmentsTable, attachmentContentsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { sendViaGmailApi, isGmailApiAvailable } from "@/lib/gmail-sender";
import { decompressContent } from "@/lib/compression";
import path from "node:path";
import fs from "node:fs";


// Maximum email size: 24.5 MB safely under Gmail's 25MB limit
const MAX_EMAIL_SIZE_BYTES = 24.5 * 1024 * 1024;

type NmAttachment = { filename: string; content: Buffer; contentType: string };

const transporterCache = new Map<number, nodemailer.Transporter>();

function getTransporter(accountRow: typeof accountsTable.$inferSelect): nodemailer.Transporter {
  let transporter = transporterCache.get(accountRow.id);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 1,
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

function estimateMailSize(html: string, attachments: NmAttachment[]): number {
  const htmlSize = Buffer.byteLength(html, "utf-8");
  const attachSize = attachments.reduce((sum, a) => sum + a.content.length, 0);
  return Math.round((htmlSize + attachSize) * 1.37); // base64 overhead
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

async function getAttachmentBuffer(contentStr: string | null): Promise<Buffer> {
  const decompressed = decompressContent(contentStr) || "";
  if (decompressed.startsWith("http://") || decompressed.startsWith("https://")) {
    const res = await fetch(decompressed);
    if (!res.ok) {
      throw new Error(`Failed to download attachment from URL: ${decompressed}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  return Buffer.from(decompressed, "base64");
}

async function getUserAttachments(userId: number): Promise<NmAttachment[]> {
  const rows = await db
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
        sql`${attachmentsTable.type} IN ('terms', 'catalog')`
      )
    );

  const attachmentPromises = rows.map(async r => {
    const buffer = await getAttachmentBuffer(r.content);
    return {
      filename: r.filename,
      content: buffer,
      contentType: r.mimeType,
    };
  });

  return Promise.all(attachmentPromises);
}

// GET or POST /api/cron/process-queue
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  // Simple token security check
  if (cronSecret && secretParam !== cronSecret && req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch next pending email whose scheduledAt timestamp has matured
    const [pendingEmail] = await db
      .select()
      .from(emailLogsTable)
      .where(
        and(
          eq(emailLogsTable.status, "pending"),
          lte(emailLogsTable.scheduledAt, new Date())
        )
      )
      .orderBy(emailLogsTable.scheduledAt)
      .limit(1);

    if (!pendingEmail) {
      return NextResponse.json({ message: "No pending emails scheduled for this interval" });
    }

    console.log(`Processing email queue ID: ${pendingEmail.id} for ${pendingEmail.recipientEmail}`);

    // Mark email as failed initially so if the serverless function crashes mid-execution (OOM / timeout),
    // it won't get stuck in an infinite sending loop. If it succeeds, we update it to 'sent'.
    await db
      .update(emailLogsTable)
      .set({ status: "failed", errorMessage: "Execution interrupted or serverless function timed out." })
      .where(eq(emailLogsTable.id, pendingEmail.id));

    // 2. Fetch associated account
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, pendingEmail.accountId))
      .limit(1);

    if (!account || !account.isActive) {
      await db
        .update(emailLogsTable)
        .set({ status: "failed", errorType: "auth_error", errorMessage: "SMTP Sender account is inactive or not found." })
        .where(eq(emailLogsTable.id, pendingEmail.id));
      return NextResponse.json({ error: "Sender account inactive", logId: pendingEmail.id });
    }

    // 3. Fetch template or default HTML
    let htmlContent = "<p>D Trades outreach mail</p>";
    if (pendingEmail.templateId) {
      const [template] = await db
        .select()
        .from(templatesTable)
        .where(eq(templatesTable.id, pendingEmail.templateId))
        .limit(1);
      if (template) {
        htmlContent = template.htmlContent;
      }
    }

    // Replace template variables
    let finalizedHtml = htmlContent;
    if (pendingEmail.recipientName) {
      finalizedHtml = finalizedHtml.replace(/\{\{\s*name\s*\}\}/g, pendingEmail.recipientName);
    }

    // 4. Fetch signature and signature banner
    let globalSignatureHtml = null;
    try {
      const [sigRow] = await db
        .select({ content: attachmentContentsTable.content })
        .from(attachmentsTable)
        .where(and(eq(attachmentsTable.type, "signature"), eq(attachmentsTable.isActive, true)))
        .limit(1);
      if (sigRow) {
        const decompressed = decompressContent(sigRow.content) || "";
        globalSignatureHtml = Buffer.from(decompressed, "base64").toString("utf-8");
      }
    } catch (e: any) {
      console.error("Error loading signature:", e.message);
    }

    let customBannerRow = null;
    try {
      const [bannerRow] = await db
        .select({
          filename: attachmentsTable.filename,
          content: attachmentContentsTable.content,
          mimeType: attachmentsTable.mimeType,
        })
        .from(attachmentsTable)
        .where(and(eq(attachmentsTable.type, "signature_banner"), eq(attachmentsTable.isActive, true)))
        .limit(1);
      if (bannerRow) {
        customBannerRow = {
          filename: bannerRow.filename,
          content: bannerRow.content,
          mimeType: bannerRow.mimeType,
        };
      }
    } catch (e: any) {
      console.error("Error loading signature banner:", e.message);
    }

    if (!customBannerRow && globalSignatureHtml) {
      // Remove the hardcoded banner placeholder from the DB signature if no custom banner exists
      globalSignatureHtml = globalSignatureHtml
        .replace(/<div[^>]*>\s*<img[^>]*src="cid:signature_banner_image"[^>]*>\s*<\/div>/i, "")
        .replace(/<img[^>]*src="cid:signature_banner_image"[^>]*>/i, "");
    }

    const signatureBannerCid = "signature_banner_image";
    const bannerHtml = customBannerRow ? `
      <div style="margin-top: 15px;">
        <img src="cid:${signatureBannerCid}" alt="D Trades Spices & Ingredients" style="width: 100%; max-width: 600px; display: block;" />
      </div>
    ` : "";

    const signatureHtml = account.signature
      ? `<br><br><div style="font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.5; margin-top: 20px;">
          ${account.signature}
          ${bannerHtml}
         </div>`
      : (globalSignatureHtml || `
        <br><br>
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.5; margin-top: 20px;">
          <p style="margin: 0 0 4px; color: #555555;">Warm regards,</p>
          <p style="margin: 0 0 4px; font-weight: bold; color: #2d2d2d; font-size: 16px;">Dhivya Kunarajah</p>
          <p style="margin: 0 0 4px; font-weight: bold; color: #c47a1b; font-size: 14px;">Founder, D Trades</p>
          <p style="margin: 0 0 4px; color: #555555; font-size: 13px;">📞 +91 7708194433</p>
          <p style="margin: 0 0 4px; color: #555555; font-size: 13px;">🌐 <a href="https://dtradesinternational.in" target="_blank" style="color: #c47a1b; text-decoration: none;">dtradesinternational.in</a></p>
          <p style="margin: 0 0 16px; color: #555555; font-size: 13px;">✉️ <a href="mailto:dtradesinternational@gmail.com" style="color: #c47a1b; text-decoration: none;">dtradesinternational@gmail.com</a></p>
          ${bannerHtml}
        </div>
      `);

    let htmlWithSignature = finalizedHtml;
    const signatureCheckToken = account.signature ? "div style=" : "Dhivya Kunarajah";
    if (!finalizedHtml.includes(signatureCheckToken)) {
      if (finalizedHtml.includes("</div></body></html>")) {
        htmlWithSignature = finalizedHtml.replace("</div></body></html>", `${signatureHtml}</div></body></html>`);
      } else if (finalizedHtml.includes("</body></html>")) {
        htmlWithSignature = finalizedHtml.replace("</body></html>", `${signatureHtml}</body></html>`);
      } else {
        htmlWithSignature = finalizedHtml + signatureHtml;
      }
    }

    // 5. Fetch associated user to get userId for attachments mapping
    const [associatedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, account.email))
      .limit(1);

    const attachments = await getUserAttachments(associatedUser ? associatedUser.id : 0);

    const mailAttachments = [...attachments];
    if (customBannerRow) {
      const bannerBuffer = await getAttachmentBuffer(customBannerRow.content);
      mailAttachments.push({
        filename: customBannerRow.filename,
        content: bannerBuffer,
        contentType: customBannerRow.mimeType,
        cid: signatureBannerCid
      } as any);
    }

    // 6. Size guard verification
    const estimatedSize = estimateMailSize(htmlWithSignature, attachments);
    if (estimatedSize > MAX_EMAIL_SIZE_BYTES) {
      const sizeMsg = `Email too large (~${Math.round(estimatedSize / 1024 / 1024)}MB). Gmail limit is 25MB. Remove large attachments.`;
      await db
        .update(emailLogsTable)
        .set({ status: "failed", errorType: "limit_reached", errorMessage: sizeMsg })
        .where(eq(emailLogsTable.id, pendingEmail.id));
      return NextResponse.json({ error: "Email size limit exceeded", logId: pendingEmail.id });
    }

    const toAddress = pendingEmail.recipientName ? `"${pendingEmail.recipientName}" <${pendingEmail.recipientEmail}>` : pendingEmail.recipientEmail;

    // 7. Dispatch via Gmail API or SMTP Fallback
    if (isGmailApiAvailable()) {
      await sendViaGmailApi({
        fromEmail: account.email,
        fromName: account.name,
        to: toAddress,
        subject: pendingEmail.subject,
        html: htmlWithSignature,
        attachments: mailAttachments.map(a => ({
          filename: (a as any).filename,
          content: (a as any).content,
          contentType: (a as any).contentType || (a as any).mimeType,
          cid: (a as any).cid,
        })),
      });
    } else {
      const transporter = getTransporter(account);
      await transporter.sendMail({
        from: `"${account.name}" <${account.email}>`,
        to: toAddress,
        subject: pendingEmail.subject,
        html: htmlWithSignature,
        attachments: mailAttachments,
      });
    }

    // 8. Update database log on success!
    await db
      .update(emailLogsTable)
      .set({ status: "sent", sentAt: new Date(), errorMessage: null, errorType: null })
      .where(eq(emailLogsTable.id, pendingEmail.id));

    await db
      .update(accountsTable)
      .set({ sentToday: sql`${accountsTable.sentToday} + 1` })
      .where(eq(accountsTable.id, account.id));

    console.log(`Email successfully sent to ${pendingEmail.recipientEmail}`);
    return NextResponse.json({ success: true, logId: pendingEmail.id, recipient: pendingEmail.recipientEmail });

  } catch (err: any) {
    console.error("Queue execution error:", err.message);
    // Update db with failure
    try {
      const { errorType, message } = classifyError(err);
      const { searchParams } = new URL(req.url);
      const logIdQuery = searchParams.get("logId");
      const targetId = logIdQuery ? parseInt(logIdQuery) : null;
      
      if (targetId) {
        await db
          .update(emailLogsTable)
          .set({ status: "failed", errorType, errorMessage: message })
          .where(eq(emailLogsTable.id, targetId));
      }
    } catch (e: any) {
      console.error("Failed to write error to db:", e.message);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Support POST route as well
export async function POST(req: Request) {
  return GET(req);
}
