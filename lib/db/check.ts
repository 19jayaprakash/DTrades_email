import { db } from './src/index';
import { emailLogsTable } from './src/schema/email_logs';
import { accountsTable } from './src/schema/accounts';
import { usersTable } from './src/schema/users';
import { attachmentsTable, attachmentContentsTable, userAttachmentsTable } from './src/schema/attachments';
import { templatesTable } from './src/schema/templates';
import { eq, and } from 'drizzle-orm';
import { decompressContent } from '../../artifacts/api-server/src/lib/compression';

const MAX_EMAIL_SIZE_BYTES = 25 * 1024 * 1024;

async function getAttachmentBuffer(contentStr: string | null): Promise<{ buffer: Buffer; originalSize?: number }> {
  const decompressed = decompressContent(contentStr) || "";
  if (decompressed.startsWith("http://") || decompressed.startsWith("https://")) {
    const res = await fetch(decompressed);
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

function estimateMailSize(html: string, attachments: any[]): number {
  const htmlSize = Buffer.byteLength(html, "utf-8");
  const attachSize = attachments.reduce((sum, a) => sum + (a.originalSize ?? a.content.length), 0);
  return Math.round((htmlSize + attachSize) * 1.37);
}

async function run() {
  const pendingEmail = { accountId: 8, templateId: 5, selectedCatalogIds: null as number[] | null };
  const accountsRow = await db.select().from(accountsTable).where(eq(accountsTable.id, pendingEmail.accountId)).limit(1);
  const accountRow = accountsRow[0];
  const associatedUser = await db.select().from(usersTable).where(eq(usersTable.email, accountRow.email)).limit(1).then(r => r[0]);

  const templateRow = await db.select().from(templatesTable).where(eq(templatesTable.id, pendingEmail.templateId)).limit(1);
  const htmlContent = templateRow[0]?.htmlContent || "";

  let htmlWithSignature = htmlContent;
  if (associatedUser?.emailSignature) {
    htmlWithSignature += `<br><br>${associatedUser.emailSignature}`;
  }

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
        eq(userAttachmentsTable.userId, associatedUser.id),
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
  
  const attachments = await Promise.all(attachmentPromises);
  const mailAttachments = [...attachments];

  const [customBannerRow] = await db
    .select({ filename: attachmentsTable.filename, content: attachmentContentsTable.content, mimeType: attachmentsTable.mimeType })
    .from(attachmentsTable)
    .innerJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
    .where(and(eq(attachmentsTable.type, "signature_banner"), eq(attachmentsTable.isActive, true)))
    .limit(1);

  if (!accountRow.signature) {
    if (customBannerRow) {
      const { buffer, originalSize } = await getAttachmentBuffer(customBannerRow.content);
      mailAttachments.push({
        filename: customBannerRow.filename,
        content: buffer,
        contentType: customBannerRow.mimeType,
        originalSize,
        cid: "signature_banner"
      } as any);
    }
  }

  console.log(mailAttachments.map(m => ({ filename: m.filename, length: m.content.length, orig: m.originalSize })));

  const estimatedSize = estimateMailSize(htmlWithSignature, mailAttachments);
  console.log(`Estimated Size: ${estimatedSize} bytes`);
  console.log(`MB Size: ${Math.round(estimatedSize / 1024 / 1024)} MB`);
  process.exit(0);
}
run();
