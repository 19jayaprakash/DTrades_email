import { db, usersTable, emailLogsTable, accountsTable, templatesTable, attachmentsTable, userAttachmentsTable, attachmentContentsTable } from "@workspace/db";
import { eq, and, lte, sql, inArray } from "drizzle-orm";
import { sendViaGraphApi } from "@/lib/graph-sender";
import { sendViaSmtp } from "@/lib/smtp-sender";
import { broadcastStatusUpdate } from "@/lib/ws-server";
import { decompressContent } from "@/lib/compression";

// Maximum email size: 24.5 MB safely under Gmail's 25MB limit
const MAX_EMAIL_SIZE_BYTES = 24.5 * 1024 * 1024;

const globalForProcessing = global as unknown as {
  processingIds: Set<number> | undefined;
};
if (!globalForProcessing.processingIds) {
  globalForProcessing.processingIds = new Set<number>();
}
const processingIds = globalForProcessing.processingIds;

type NmAttachment = { filename: string; content: Buffer; contentType: string; originalSize?: number };

function styleLinksInHtml(html: string): string {
  if (!html) return html;
  return html.replace(/<a(\s[^>]*?)>/gi, (match, attrs) => {
    if (/style=["']/i.test(attrs)) {
      if (!/color\s*:/i.test(attrs)) {
        return `<a${attrs.replace(/style=["']([^"']*)["']/i, 'style="color: #2563eb; text-decoration: underline; $1"')}>`;
      }
      return match;
    } else {
      return `<a style="color: #2563eb; text-decoration: underline;"${attrs}>`;
    }
  });
}

function buildCleanHtml(html: string, subject: string): string {
  let processedHtml = html;
  if (html.toLowerCase().includes("<html") && html.toLowerCase().includes("<body")) {
    processedHtml = html;
  } else {
    let styles = "";
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    let cleanHtml = html;
    while ((match = styleRegex.exec(html)) !== null) {
      styles += match[1] + "\n";
    }
    cleanHtml = cleanHtml.replace(styleRegex, "");
    cleanHtml = cleanHtml.replace(/<meta[^>]*>/gi, "");

    processedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.7; margin: 0; padding: 0; background-color: #f8fafc; }
    a { color: #2563eb; text-decoration: underline; }
    .email-container { max-width: 680px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; }
    ${styles}
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; width: 100% !important; min-width: 100%; margin: 0; padding: 0;">
    <tr>
      <td align="center" style="padding: 20px 16px;">
        <!--[if mso]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="680">
          <tr>
            <td align="left" valign="top" width="680">
        <![endif]-->
        <div class="email-container" style="max-width: 680px; width: 100%; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; text-align: left; padding: 32px 24px; box-sizing: border-box;">
          ${cleanHtml}
        </div>
        <!--[if mso]>
            </td>
          </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
  return styleLinksInHtml(processedHtml);
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
  if (msg.includes("auth") || msg.includes("535") || msg.includes("530") || msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) {
    return { errorType: "auth_error", message: err.message };
  }
  if (msg.includes("552") || msg.includes("size") || msg.includes("maxsize") || msg.includes("message size") || msg.includes("too large") || msg.includes("413")) {
    return { errorType: "limit_reached", message: "Email too large. Remove large attachments." };
  }
  if (msg.includes("limit") || msg.includes("quota") || msg.includes("550 5.7") || msg.includes("429") || msg.includes("too many requests")) {
    return { errorType: "limit_reached", message: err.message };
  }
  if (msg.includes("block") || msg.includes("reject") || msg.includes("spam")) {
    return { errorType: "blocked", message: err.message };
  }
  if (msg.includes("invalid") || msg.includes("recipient") || msg.includes("not found")) {
    return { errorType: "invalid_email", message: err.message };
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

export async function processQueue() {
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
    .limit(15); // limit of 15 emails per execution run

  if (pendingRows.length === 0) {
    return { message: "No pending emails scheduled for this interval", results: [] };
  }

  const results = [];

  for (const pendingEmail of pendingRows) {
    if (processingIds.has(pendingEmail.id)) {
      console.log(`Email ID ${pendingEmail.id} is already being processed. Skipping.`);
      continue;
    }

    let mailAttachments: any[] = [];
    processingIds.add(pendingEmail.id);

    try {
      try {
        console.log(`Processing email queue ID: ${pendingEmail.id} for ${pendingEmail.recipientEmail}`);

        // Lock the email log by setting scheduledAt in the future and marking in-progress
        await db
          .update(emailLogsTable)
          .set({ 
            errorMessage: "Outbound transmission in progress...",
            scheduledAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes lock
          })
          .where(eq(emailLogsTable.id, pendingEmail.id));

      // Fetch associated account
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

      // Fetch template or default HTML
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

      // Fetch signature and signature banner
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

      // Fetch associated user to get userId for attachments mapping
      const [associatedUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, account.email))
        .limit(1);

      mailAttachments = [];
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

      // Size guard verification
      const estimatedSize = estimateMailSize(htmlWithSignature, mailAttachments);
      if (estimatedSize > MAX_EMAIL_SIZE_BYTES) {
        const sizeMsg = `Email too large (~${Math.round(estimatedSize / 1024 / 1024)}MB). Remove large signature banner.`;
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

      // Dispatch via SMTP (preferred) or fall back to Microsoft Graph API
      if (account.smtpHost && account.smtpUser && account.smtpPass) {
        await sendViaSmtp({
          smtpHost: account.smtpHost,
          smtpPort: account.smtpPort || 465,
          smtpUser: account.smtpUser,
          smtpPass: account.smtpPass,
          fromEmail: account.email,
          fromName: account.name,
          to: toAddress,
          subject: pendingEmail.subject,
          html: cleanHtml,
          text: textFallback,
          attachments: mailAttachments,
        });
      } else {
        await sendViaGraphApi({
          fromEmail: account.email,
          fromName: account.name,
          to: toAddress,
          subject: pendingEmail.subject,
          html: cleanHtml,
          text: textFallback,
          attachments: mailAttachments,
        });
      }

      // Update database log on success!
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

      // Broadcast success status update via WebSocket
      broadcastStatusUpdate({
        type: "email_status_update",
        data: {
          id: pendingEmail.id,
          status: "sent",
          sentAt: new Date(),
          errorMessage: null,
        }
      });

    } catch (err: unknown) {
      console.error(`Queue execution error for ID ${pendingEmail.id}:`, (err as Error).message);
      
      try {
        const error = err as Error;
        const { errorType, message } = classifyError(error);
        
        let retryCount = 0;
        if (pendingEmail.errorDetails) {
          try {
            const details = JSON.parse(pendingEmail.errorDetails);
            if (details && typeof details.retryCount === "number") {
              retryCount = details.retryCount;
            }
          } catch (e) {}
        }

        const isRetryable = (errorType === "smtp_failed" || errorType === "unknown") && retryCount < 5;

        if (isRetryable) {
          const nextRetry = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
          const updatedRetryCount = retryCount + 1;

          await db
            .update(emailLogsTable)
            .set({ 
              status: "pending", 
              scheduledAt: nextRetry,
              errorType, 
              errorMessage: `${message} (Retry attempt ${updatedRetryCount}/5 scheduled)`,
              errorDetails: JSON.stringify({
                rawError: error.message,
                stack: error.stack,
                method: "smtp",
                retryCount: updatedRetryCount,
                attachmentCount: mailAttachments.length,
                attachments: mailAttachments.map(a => ({ filename: (a as any).filename, contentType: (a as any).contentType, size: (a as any).originalSize ?? (a as any).content?.length }))
              }, null, 2)
            })
            .where(eq(emailLogsTable.id, pendingEmail.id));

          results.push({ id: pendingEmail.id, status: "pending", error: `${message} (Scheduled retry ${updatedRetryCount}/5)` });

          // Broadcast status update
          broadcastStatusUpdate({
            type: "email_status_update",
            data: {
              id: pendingEmail.id,
              status: "pending",
              sentAt: null,
              errorMessage: `${message} (Retry ${updatedRetryCount}/5 scheduled)`,
            }
          });
        } else {
          // Hard failure or exceeded max retries
          const finalMsg = retryCount >= 5 ? `Max retries exceeded: ${message}` : message;
          await db
            .update(emailLogsTable)
            .set({ 
              status: "failed", 
              errorType, 
              errorMessage: finalMsg,
              errorDetails: JSON.stringify({
                rawError: error.message,
                stack: error.stack,
                method: "smtp",
                retryCount: retryCount,
                attachmentCount: mailAttachments.length,
                attachments: mailAttachments.map(a => ({ filename: (a as any).filename, contentType: (a as any).contentType, size: (a as any).originalSize ?? (a as any).content?.length }))
              }, null, 2)
            })
            .where(eq(emailLogsTable.id, pendingEmail.id));

          results.push({ id: pendingEmail.id, status: "failed", error: finalMsg });

          // Broadcast failed status update via WebSocket
          broadcastStatusUpdate({
            type: "email_status_update",
            data: {
              id: pendingEmail.id,
              status: "failed",
              sentAt: null,
              errorMessage: finalMsg,
            }
          });
        }
      } catch (e: any) {
        console.error("Failed to write error to db:", e.message);
      }
    }
  } finally {
    processingIds.delete(pendingEmail.id);
  }
}

  return { success: true, processedCount: results.length, results };
}
