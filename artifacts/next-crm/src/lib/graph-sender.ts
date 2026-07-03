import { Buffer } from "node:buffer";

export type GraphAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid?: string;
};

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0; // Epoch ms

async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph API credentials not configured in environment variables. " +
      "Please set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, and MICROSOFT_CLIENT_SECRET."
    );
  }

  // Check cache (with 1 minute safety buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to obtain Microsoft Graph access token: ${res.status} - ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

/** Returns true if Microsoft Graph credentials are configured */
export function isGraphApiAvailable(): boolean {
  return !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET
  );
}

/**
 * Send an email via Microsoft Graph API on behalf of `fromEmail`.
 */
export async function sendViaGraphApi(opts: {
  fromEmail: string;
  fromName: string;
  to: string; // "Name" <email> or just email
  subject: string;
  html: string;
  text?: string;
  attachments?: GraphAttachment[];
}): Promise<void> {
  const accessToken = await getAccessToken();

  // Parse recipient address
  // Extract email address and name from potential "Name" <email> format
  let recipientEmail = opts.to;
  let recipientName = "";

  const emailRegex = /(?:"?([^"]*)"?\s+)?<([^>]+)>/;
  const match = opts.to.match(emailRegex);
  if (match) {
    recipientName = match[1] || "";
    recipientEmail = match[2];
  }

  // Build the message payload
  const formattedAttachments = (opts.attachments || []).map((att) => {
    const isInline = !!att.cid;
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.filename,
      contentType: att.contentType,
      contentBytes: att.content.toString("base64"),
      isInline,
      ...(isInline ? { contentId: att.cid } : {}),
    };
  });

  const requestBody = {
    message: {
      subject: opts.subject,
      body: {
        contentType: "HTML",
        content: opts.html,
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipientEmail,
            ...(recipientName ? { name: recipientName } : {}),
          },
        },
      ],
      attachments: formattedAttachments,
    },
    saveToSentItems: true,
  };

  const url = `https://graph.microsoft.com/v1.0/users/${opts.fromEmail}/sendMail`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Microsoft Graph API sendMail failed for user ${opts.fromEmail}: ${res.status} - ${errText}`);
  }
}
