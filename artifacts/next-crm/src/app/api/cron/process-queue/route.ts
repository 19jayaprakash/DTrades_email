import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { db, usersTable, emailLogsTable, accountsTable, templatesTable, attachmentsTable, userAttachmentsTable, attachmentContentsTable } from "@workspace/db";
import { eq, and, lte, sql, inArray } from "drizzle-orm";
import nodemailer from "nodemailer";
import { sendViaGmailApi, isGmailApiAvailable } from "@/lib/gmail-sender";
import { decompressContent } from "@/lib/compression";
import path from "node:path";
import fs from "node:fs";


// Maximum email size: 24.5 MB safely under Gmail's 25MB limit
const MAX_EMAIL_SIZE_BYTES = 24.5 * 1024 * 1024;

type NmAttachment = { filename: string; content: Buffer; contentType: string; originalSize?: number };

const transporterCache = new Map<number, nodemailer.Transporter>();

function getTransporter(accountRow: typeof accountsTable.$inferSelect): nodemailer.Transporter {
  let transporter = transporterCache.get(accountRow.id);
  if (!transporter) {
    const isGmail = (accountRow.smtpHost || '').toLowerCase().includes('gmail.com');
    transporter = nodemailer.createTransport({
      host: accountRow.smtpHost,
      port: accountRow.smtpPort,
      secure: accountRow.smtpPort === 465,
      auth: { user: accountRow.smtpUser, pass: accountRow.smtpPass },
      ...(isGmail ? {} : { tls: { rejectUnauthorized: false } }),
    });
    transporterCache.set(accountRow.id, transporter);
  }
  return transporter;
}

function buildCleanHtml(html: string, subject: string): string {
  if (html.toLowerCase().includes("<html") && html.toLowerCase().includes("<body")) {
    return html;
  }
  let styles = "";
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  let cleanHtml = html;
  while ((match = styleRegex.exec(html)) !== null) {
    styles += match[1] + "\n";
  }
  cleanHtml = cleanHtml.replace(styleRegex, "");
  cleanHtml = cleanHtml.replace(/<meta[^>]*>/gi, "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.7; margin: 0; padding: 0; }
    ${styles}
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  ${cleanHtml}
</body>
</html>`;
}

function cleanTextFallback(html: string): string {
  let text = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");
  text = text.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/\n\s*\n+/g, "\n\n");
  return text.trim();
}

function estimateMailSize(html: string, attachments: NmAttachment[]): number {
  const htmlSize = Buffer.byteLength(html, "utf-8");
  const attachSize = attachments.reduce((sum, a) => sum + (a.originalSize ?? a.content.length), 0);
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

async function getAttachmentBuffer(contentStr: string | null): Promise<{ buffer: Buffer; originalSize?: number }> {
  const decompressed = decompressContent(contentStr) || "";
  if (decompressed.startsWith("http://") || decompressed.startsWith("https://")) {
    const res = await fetch(decompressed);
    if (!res.ok) {
      throw new Error(`Failed to download attachment from URL: ${decompressed}`);
    }
    const lenStr = res.headers.get("content-length");
    const size = lenStr ? parseInt(lenStr, 10) : 0;
    if (size > MAX_EMAIL_SIZE_BYTES) {
      return { buffer: Buffer.alloc(0), originalSize: size };
    }
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer) };
  }
  const approxSize = Math.round(decompressed.length * 0.75);
  if (approxSize > MAX_EMAIL_SIZE_BYTES) {
    return { buffer: Buffer.alloc(0), originalSize: approxSize };
  }
  return { buffer: Buffer.from(decompressed, "base64") };
}

async function getUserAttachments(userId: number, selectedCatalogIds?: number[] | null): Promise<NmAttachment[]> {
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
        eq(attachmentsTable.type, 'terms')
      )
    );

  const attachmentPromises = termsRows.map(async r => {
    const { buffer, originalSize } = await getAttachmentBuffer(r.content);
    return {
      filename: r.filename,
      content: buffer,
      contentType: r.mimeType,
      originalSize,
    };
  });
  
  const results = await Promise.all(attachmentPromises);

  if (selectedCatalogIds && selectedCatalogIds.length > 0) {
    const catalogRows = await db
      .select({
        filename: attachmentsTable.filename,
        content: attachmentContentsTable.content,
        mimeType: attachmentsTable.mimeType,
      })
      .from(attachmentsTable)
      .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .where(
        and(
          eq(attachmentsTable.isActive, true),
          inArray(attachmentsTable.id, selectedCatalogIds)
        )
      );

    const catalogPromises = catalogRows.map(async r => {
      const { buffer, originalSize } = await getAttachmentBuffer(r.content);
      return {
        filename: r.filename,
        content: buffer,
        contentType: r.mimeType,
        originalSize,
      };
    });
    
    const catalogResults = await Promise.all(catalogPromises);
    results.push(...catalogResults);
  }

  return results;
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

  const pendingRows = await db
    .select()
    .from(emailLogsTable)
    .where(
      and(
        eq(emailLogsTable.status, "pending"),
        lte(emailLogsTable.scheduledAt, new Date())
      )
    )
    .orderBy(emailLogsTable.scheduledAt)
    .limit(5);

  if (pendingRows.length === 0) {
    return NextResponse.json({ message: "No pending emails scheduled for this interval" });
  }

  const results = [];

  for (const pendingEmail of pendingRows) {
    let mailAttachments: any[] = [];
    try {
      console.log(`Processing email queue ID: ${pendingEmail.id} for ${pendingEmail.recipientEmail}`);

      // Mark email as failed initially to prevent infinite loop
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
        results.push({ id: pendingEmail.id, status: "failed", error: "Sender account inactive" });
        continue;
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
          .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
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
          .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
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

      const attachments = await getUserAttachments(
        associatedUser ? associatedUser.id : 0, 
        pendingEmail.selectedCatalogIds
      );

      mailAttachments = [...attachments];
      if (customBannerRow) {
        const bannerResult = await getAttachmentBuffer(customBannerRow.content);
        mailAttachments.push({
          filename: customBannerRow.filename,
          content: bannerResult.buffer,
          contentType: customBannerRow.mimeType,
          originalSize: bannerResult.originalSize,
          cid: signatureBannerCid
        } as any);
      }

      // 6. Size guard verification
      const estimatedSize = estimateMailSize(htmlWithSignature, attachments);
      if (estimatedSize > MAX_EMAIL_SIZE_BYTES) {
        const sizeMsg = `Email too large (~${Math.round(estimatedSize / 1024 / 1024)}MB). Gmail limit is 25MB. Remove large attachments.`;
        await db
          .update(emailLogsTable)
          .set({ 
            status: "failed", 
            errorType: "limit_reached", 
            errorMessage: sizeMsg,
            errorDetails: JSON.stringify({
              estimatedSize,
              attachmentCount: mailAttachments.length,
              attachments: mailAttachments.map(a => ({ filename: (a as any).filename, contentType: (a as any).contentType, size: (a as any).originalSize ?? (a as any).content?.length }))
            }, null, 2)
          })
          .where(eq(emailLogsTable.id, pendingEmail.id));
        results.push({ id: pendingEmail.id, status: "failed", error: "Size exceeded" });
        continue;
      }

      const toAddress = pendingEmail.recipientName ? `"${pendingEmail.recipientName.replace(/"/g, '\\"')}" <${pendingEmail.recipientEmail}>` : pendingEmail.recipientEmail;
      const cleanHtml = buildCleanHtml(htmlWithSignature, pendingEmail.subject);
      const textFallback = cleanTextFallback(htmlWithSignature);

      // 7. Dispatch via Gmail API or SMTP Fallback
      if (false && isGmailApiAvailable()) {
        await sendViaGmailApi({
          fromEmail: account.email,
          fromName: account.name,
          to: toAddress,
          subject: pendingEmail.subject,
          html: cleanHtml,
          text: textFallback,
          attachments: mailAttachments.map(a => ({
            filename: (a as any).filename,
            content: (a as any).content,
            contentType: (a as any).contentType || (a as any).mimeType,
            cid: (a as any).cid,
          })),
        } as any);
      } else {
        const transporter = getTransporter(account);
        await transporter.sendMail({
          from: `"${account.name.replace(/"/g, '\\"')}" <${account.email}>`,
          replyTo: account.email,
          to: toAddress,
          subject: pendingEmail.subject,
          html: cleanHtml,
          text: textFallback,
          attachments: mailAttachments,
          xMailer: false
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
      results.push({ id: pendingEmail.id, status: "sent", recipient: pendingEmail.recipientEmail });

    } catch (err: unknown) {
      console.error(`Queue execution error for ID ${pendingEmail.id}:`, (err as Error).message);
      // Update db with failure
      try {
        const error = err as Error;
        const { errorType, message } = classifyError(error);
        await db
          .update(emailLogsTable)
          .set({ 
            status: "failed", 
            errorType, 
            errorMessage: message,
            errorDetails: JSON.stringify({
              rawError: error.message,
              stack: error.stack,
              method: "smtp",
              attachmentCount: mailAttachments.length,
              attachments: mailAttachments.map(a => ({ filename: (a as any).filename, contentType: (a as any).contentType, size: (a as any).originalSize ?? (a as any).content?.length }))
            }, null, 2)
          })
          .where(eq(emailLogsTable.id, pendingEmail.id));
      } catch (e: any) {
        console.error("Failed to write error to db:", e.message);
      }
      results.push({ id: pendingEmail.id, status: "failed", error: (err as Error).message });
    }
  }

  return NextResponse.json({ success: true, processedCount: results.length, results });
}

// Support POST route as well
export async function POST(req: Request) {
  return GET(req);
}
