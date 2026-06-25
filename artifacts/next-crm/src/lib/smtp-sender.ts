import nodemailer from "nodemailer";

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

  await transporter.sendMail(mailOptions);
}
