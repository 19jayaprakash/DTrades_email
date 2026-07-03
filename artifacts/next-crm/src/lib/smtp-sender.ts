import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import MailComposer from "nodemailer/lib/mail-composer";

export type SmtpAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid?: string;
};

export async function sendViaSmtp(opts: {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: SmtpAttachment[];
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: opts.smtpHost,
    port: opts.smtpPort,
    secure: opts.smtpPort === 465, // SSL
    auth: {
      user: opts.smtpUser,
      pass: opts.smtpPass,
    },
    tls: {
      rejectUnauthorized: false, // Don't fail on invalid/self-signed certs (common for VPS)
    },
  });

  const mailOptions = {
    from: opts.fromName ? `"${opts.fromName}" <${opts.fromEmail}>` : opts.fromEmail,
    to: opts.to,
    subject: opts.subject,
    text: opts.text || "",
    html: opts.html,
    attachments: (opts.attachments || []).map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
      cid: att.cid,
    })),
  };

  // Send the email via SMTP first
  await transporter.sendMail(mailOptions);

  // Sync to IMAP Sent folder in the background (wrapped in try-catch to avoid breaking success state)
  try {
    const imap = new ImapFlow({
      host: opts.smtpHost,
      port: 993, // default secure IMAP port
      secure: true,
      auth: {
        user: opts.smtpUser,
        pass: opts.smtpPass,
      },
      logger: false,
    });

    await imap.connect();
    const mailboxes = await imap.list();
    const sentMailbox = mailboxes.find(m => m.name.toLowerCase().includes("sent"))?.path || "Sent";

    const composer = new MailComposer(mailOptions);
    const messageBuffer = await composer.compile().build();

    await imap.append(sentMailbox, messageBuffer, ["\\Seen"]);
    await imap.logout();
    console.log(`[IMAP Sync] Successfully copied sent email to ${sentMailbox} for ${opts.smtpUser}`);
  } catch (imapErr) {
    console.error(`[IMAP Sync] Failed to copy sent email to Sent folder for ${opts.smtpUser}:`, imapErr);
  }
}

