/**
 * Gmail API sender using Service Account with Domain-Wide Delegation.
 *
 * Setup (one-time, by admin):
 *  1. console.cloud.google.com → Create/Select project → Enable "Gmail API"
 *  2. IAM & Admin → Service Accounts → Create → Download JSON key
 *  3. admin.google.com → Security → API Controls → Domain-wide Delegation
 *     → Add Client ID from JSON key → Scope: https://www.googleapis.com/auth/gmail.send
 *  4. Paste the JSON key content (minified) into .env as GOOGLE_SERVICE_ACCOUNT_JSON='{...}'
 */
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { logger } from "./logger";

export type GmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid?: string;
};

let serviceAccountCredentials: any = null;

function getServiceAccount(): any | null {
  if (serviceAccountCredentials) return serviceAccountCredentials;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    serviceAccountCredentials = JSON.parse(raw);
    return serviceAccountCredentials;
  } catch {
    logger.error("GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON");
    return null;
  }
}

/** Returns true if Gmail API credentials are configured */
export function isGmailApiAvailable(): boolean {
  return getServiceAccount() !== null;
}

/**
 * Build a raw MIME message using nodemailer (buffer transport) and
 * send it via the Gmail API on behalf of `fromEmail`.
 */
export async function sendViaGmailApi(opts: {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  attachments: GmailAttachment[];
}): Promise<void> {
  const creds = getServiceAccount();
  if (!creds) throw new Error("Gmail API service account not configured");

  // Authenticate as the sender (impersonate via domain-wide delegation)
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: opts.fromEmail, // send on behalf of this user
  });

  const gmail = google.gmail({ version: "v1", auth });

  // Build the raw MIME message using nodemailer's buffer transport
  const buf = await buildRawMime(opts);

  // Gmail API expects base64url-encoded raw MIME
  const raw = buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

/** Uses nodemailer in buffer/stream mode to build a raw MIME Buffer */
async function buildRawMime(opts: {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  attachments: GmailAttachment[];
}): Promise<Buffer> {
  const transport = nodemailer.createTransport({ streamTransport: true, newline: "unix", buffer: true });

  const info: any = await new Promise((resolve, reject) => {
    transport.sendMail(
      {
        from: `"${opts.fromName}" <${opts.fromEmail}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        attachments: opts.attachments.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          ...(a.cid ? { cid: a.cid } : {}),
        })),
      },
      (err, inf) => (err ? reject(err) : resolve(inf))
    );
  });

  return info.message as Buffer;
}
