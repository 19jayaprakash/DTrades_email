import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import bcrypt from "bcryptjs";
import { db, usersTable, accountsTable, templatesTable, emailLogsTable, attachmentsTable, userAttachmentsTable, attachmentContentsTable, attachmentChunksTable } from "@workspace/db";
import { eq, and, sql, gte, lte, count } from "drizzle-orm";
import { signToken, requireAuth, requireAdmin } from "@/lib/auth";
import { compressContent, decompressContent } from "@/lib/compression";


// Helper for parsing recipients from raw string
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

const safeAccount = (a: any) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  region: a.region,
  smtpHost: a.smtpHost,
  smtpPort: a.smtpPort,
  smtpUser: a.smtpUser,
  smtpPass: a.smtpPass,
  isActive: a.isActive,
  dailyLimit: a.dailyLimit,
  sentToday: a.sentToday,
  signature: a.signature,
  createdAt: a.createdAt,
});

// Dynamic Catch-All Route Handler
export async function GET(req: Request, { params }: { params: Promise<{ route: string[] }> }) {
  const route = (await params).route;
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const authUser = await requireAuth(req);

  // ── 1. AUTH ROUTES ──────────────────────────────────────────────────────────
  if (route[0] === "auth" && route[1] === "me") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      region: authUser.region,
      isActive: authUser.isActive,
      createdAt: authUser.createdAt,
    });
  }

  // ── 2. USERS CRUD ───────────────────────────────────────────────────────────
  if (route[0] === "users") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const idParam = route[1] ? parseInt(route[1]) : null;

    if (idParam) {
      // GET single user
      const [row] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          role: usersTable.role,
          region: usersTable.region,
          isActive: usersTable.isActive,
          createdAt: usersTable.createdAt,
          smtpHost: accountsTable.smtpHost,
          smtpPort: accountsTable.smtpPort,
          smtpUser: accountsTable.smtpUser,
          smtpPass: accountsTable.smtpPass,
          dailyLimit: accountsTable.dailyLimit,
        })
        .from(usersTable)
        .leftJoin(accountsTable, eq(usersTable.email, accountsTable.email))
        .where(eq(usersTable.id, idParam))
        .limit(1);

      if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });
      return NextResponse.json(row);
    } else {
      // GET list users
      const users = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          role: usersTable.role,
          region: usersTable.region,
          isActive: usersTable.isActive,
          createdAt: usersTable.createdAt,
          passwordPlain: usersTable.passwordPlain,
          smtpHost: accountsTable.smtpHost,
          smtpPort: accountsTable.smtpPort,
          smtpUser: accountsTable.smtpUser,
          smtpPass: accountsTable.smtpPass,
          dailyLimit: accountsTable.dailyLimit,
        })
        .from(usersTable)
        .leftJoin(accountsTable, eq(usersTable.email, accountsTable.email))
        .orderBy(usersTable.createdAt);
      return NextResponse.json(users);
    }
  }

  // ── 3. ACCOUNTS CRUD ────────────────────────────────────────────────────────
  if (route[0] === "accounts") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const idParam = route[1] ? parseInt(route[1]) : null;

    if (idParam) {
      // GET single account
      const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, idParam)).limit(1);
      if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      return NextResponse.json(safeAccount(account));
    } else {
      // GET list accounts
      const accounts = await db.select().from(accountsTable).orderBy(accountsTable.name);
      return NextResponse.json(accounts.map(safeAccount));
    }
  }

  // ── 4. TEMPLATES CRUD ───────────────────────────────────────────────────────
  if (route[0] === "templates") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const idParam = route[1] ? parseInt(route[1]) : null;

    if (idParam) {
      // GET single template
      const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, idParam)).limit(1);
      if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
      return NextResponse.json(template);
    } else {
      // GET list templates
      const templates = await db.select().from(templatesTable).orderBy(templatesTable.name);
      return NextResponse.json(templates);
    }
  }

  // ── 5. ATTACHMENTS CRUD ─────────────────────────────────────────────────────
  if (route[0] === "attachments") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const isAdmin = requireAdmin(authUser);
    const userIdQuery = searchParams.get("userId") ? parseInt(searchParams.get("userId") as string) : null;

    if (!isAdmin) {
      const rows = await db
        .select({
          id: attachmentsTable.id,
          userId: attachmentsTable.userId,
          type: attachmentsTable.type,
          name: attachmentsTable.name,
          filename: attachmentsTable.filename,
          mimeType: attachmentsTable.mimeType,
          isActive: attachmentsTable.isActive,
          content: sql<string | null>`CASE WHEN ${attachmentsTable.type} IN ('signature', 'signature_banner') THEN ${attachmentContentsTable.content} ELSE NULL END`,
          createdAt: attachmentsTable.createdAt,
        })
        .from(attachmentsTable)
        .leftJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
        .innerJoin(userAttachmentsTable, eq(userAttachmentsTable.attachmentId, attachmentsTable.id))
        .where(and(eq(userAttachmentsTable.userId, authUser.id), eq(attachmentsTable.isActive, true)))
        .orderBy(attachmentsTable.createdAt);

      return NextResponse.json(rows.map(r => ({ ...r, content: decompressContent(r.content) })));
    }

    if (userIdQuery) {
      const rows = await db
        .select({
          id: attachmentsTable.id,
          userId: attachmentsTable.userId,
          type: attachmentsTable.type,
          name: attachmentsTable.name,
          filename: attachmentsTable.filename,
          mimeType: attachmentsTable.mimeType,
          isActive: attachmentsTable.isActive,
          content: sql<string | null>`CASE WHEN ${attachmentsTable.type} IN ('signature', 'signature_banner') THEN ${attachmentContentsTable.content} ELSE NULL END`,
          createdAt: attachmentsTable.createdAt,
        })
        .from(attachmentsTable)
        .leftJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
        .innerJoin(userAttachmentsTable, eq(userAttachmentsTable.attachmentId, attachmentsTable.id))
        .where(eq(userAttachmentsTable.userId, userIdQuery))
        .orderBy(attachmentsTable.createdAt);
      return NextResponse.json(rows.map(r => ({ ...r, content: decompressContent(r.content) })));
    }

    const attachments = await db
      .select({
        id: attachmentsTable.id,
        userId: attachmentsTable.userId,
        type: attachmentsTable.type,
        name: attachmentsTable.name,
        filename: attachmentsTable.filename,
        mimeType: attachmentsTable.mimeType,
        isActive: attachmentsTable.isActive,
        content: sql<string | null>`CASE WHEN ${attachmentsTable.type} IN ('signature', 'signature_banner') THEN ${attachmentContentsTable.content} ELSE NULL END`,
        createdAt: attachmentsTable.createdAt,
      })
      .from(attachmentsTable)
      .leftJoin(attachmentContentsTable, eq(attachmentContentsTable.attachmentId, attachmentsTable.id))
      .orderBy(attachmentsTable.createdAt);

    const assignments = await db.select().from(userAttachmentsTable);

    const rows = attachments.map(att => {
      const assignedUserIds = assignments
        .filter(a => a.attachmentId === att.id)
        .map(a => a.userId);
      return {
        ...att,
        content: decompressContent(att.content),
        assignedUserIds,
      };
    });

    return NextResponse.json(rows);
  }

  // ── 6. EMAILS QUEUE & HISTORY ───────────────────────────────────────────────
  if (route[0] === "emails") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (route[1] === "queue") {
      const [pending] = await db.select({ count: count() }).from(emailLogsTable).where(eq(emailLogsTable.status, "pending"));
      return NextResponse.json({ pending: Number(pending?.count ?? 0), processing: 0, total: Number(pending?.count ?? 0) });
    }

    if (route[1] === "history") {
      const accountId = searchParams.get("accountId");
      const status = searchParams.get("status");
      const dateFrom = searchParams.get("dateFrom");
      const dateTo = searchParams.get("dateTo");
      const page = searchParams.get("page") || "1";
      const limit = searchParams.get("limit") || "50";

      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 50, 200);
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];
      if (accountId) conditions.push(eq(emailLogsTable.accountId, parseInt(accountId)));
      if (status && ["sent", "failed", "pending"].includes(status)) {
        conditions.push(eq(emailLogsTable.status, status as any));
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
            scheduledAt: emailLogsTable.scheduledAt,
          })
          .from(emailLogsTable)
          .leftJoin(accountsTable, eq(emailLogsTable.accountId, accountsTable.id))
          .where(whereClause)
          .orderBy(sql`${emailLogsTable.createdAt} desc`)
          .limit(limitNum)
          .offset(offset),
      ]);

      return NextResponse.json({
        data: rows,
        total: totalResult[0]?.count ?? 0,
        page: pageNum,
        limit: limitNum,
      });
    }
  }

  // ── 7. DASHBOARD ANALYTICS ──────────────────────────────────────────────────
  if (route[0] === "dashboard") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (route[1] === "stats") {
      const [statRows, accountRows] = await Promise.all([
        db.select({
          status: sql<string>`${emailLogsTable.status}::text`,
          cnt: count(),
        }).from(emailLogsTable).groupBy(emailLogsTable.status),
        db.select({
          total: count(),
          active: sql<number>`sum(case when ${accountsTable.isActive} then 1 else 0 end)`,
        }).from(accountsTable),
      ]);

      const stats = { sent: 0, failed: 0, pending: 0 };
      for (const row of statRows) {
        if (row.status in stats) stats[row.status as keyof typeof stats] = Number(row.cnt);
      }
      const delivered = stats.sent;
      const total = stats.sent + stats.failed;
      const bounceRate = total > 0 ? Math.round((stats.failed / total) * 100 * 10) / 10 : 0;
      const openRate = total > 0 ? Math.round(((stats.sent * 0.22)) * 10) / 10 : 0;

      return NextResponse.json({
        totalSent: stats.sent,
        totalFailed: stats.failed,
        totalPending: stats.pending,
        totalDelivered: delivered,
        openRate,
        bounceRate,
        totalAccounts: Number(accountRows[0]?.total ?? 0),
        activeAccounts: Number(accountRows[0]?.active ?? 0),
      });
    }

    if (route[1] === "account-stats") {
      const rows = await db.select({
        accountId: emailLogsTable.accountId,
        accountName: accountsTable.name,
        region: accountsTable.region,
        status: sql<string>`${emailLogsTable.status}::text`,
        cnt: count(),
      })
        .from(emailLogsTable)
        .leftJoin(accountsTable, eq(emailLogsTable.accountId, accountsTable.id))
        .groupBy(emailLogsTable.accountId, accountsTable.name, accountsTable.region, emailLogsTable.status);

      const map = new Map<number, any>();
      for (const row of rows) {
        if (!row.accountId) continue;
        if (!map.has(row.accountId)) {
          map.set(row.accountId, {
            accountId: row.accountId,
            accountName: row.accountName || "Unknown",
            region: row.region || "Unknown",
            sent: 0, failed: 0, pending: 0,
          });
        }
        const entry = map.get(row.accountId)!;
        if (row.status === "sent") entry.sent = Number(row.cnt);
        if (row.status === "failed") entry.failed = Number(row.cnt);
        if (row.status === "pending") entry.pending = Number(row.cnt);
      }

      const result = Array.from(map.values()).map(e => ({
        ...e,
        successRate: (e.sent + e.failed) > 0
          ? Math.round((e.sent / (e.sent + e.failed)) * 100 * 10) / 10
          : 100,
      }));

      return NextResponse.json(result);
    }

    if (route[1] === "daily-activity") {
      const days = Math.min(parseInt(searchParams.get("days") || "30"), 90);
      const since = new Date();
      since.setDate(since.getDate() - days);

      const rows = await db.select({
        date: sql<string>`date(${emailLogsTable.createdAt})`,
        status: sql<string>`${emailLogsTable.status}::text`,
        cnt: count(),
      })
        .from(emailLogsTable)
        .where(gte(emailLogsTable.createdAt, since))
        .groupBy(sql`date(${emailLogsTable.createdAt})`, emailLogsTable.status)
        .orderBy(sql`date(${emailLogsTable.createdAt})`);

      const dateMap = new Map<string, { date: string; sent: number; failed: number }>();
      for (const row of rows) {
        if (!dateMap.has(row.date)) dateMap.set(row.date, { date: row.date, sent: 0, failed: 0 });
        const entry = dateMap.get(row.date)!;
        if (row.status === "sent") entry.sent = Number(row.cnt);
        if (row.status === "failed") entry.failed = Number(row.cnt);
      }

      const allDates = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        allDates.push(dateMap.get(dateStr) || { date: dateStr, sent: 0, failed: 0 });
      }

      return NextResponse.json(allDates);
    }

    if (route[1] === "errors") {
      const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
      const rows = await db.select({
        id: emailLogsTable.id,
        accountName: accountsTable.name,
        recipientEmail: emailLogsTable.recipientEmail,
        errorType: emailLogsTable.errorType,
        errorMessage: emailLogsTable.errorMessage,
        createdAt: emailLogsTable.createdAt,
      })
        .from(emailLogsTable)
        .leftJoin(accountsTable, eq(emailLogsTable.accountId, accountsTable.id))
        .where(eq(emailLogsTable.status, "failed"))
        .orderBy(sql`${emailLogsTable.createdAt} desc`)
        .limit(limit);

      return NextResponse.json(rows.map(r => ({
        id: r.id,
        accountName: r.accountName || "Unknown",
        recipientEmail: r.recipientEmail,
        errorType: r.errorType || "unknown",
        errorMessage: r.errorMessage || "Unknown error",
        canRetry: true,
        createdAt: r.createdAt,
      })));
    }
  }

  return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
}

// POST endpoint handler
export async function POST(req: Request, { params }: { params: Promise<{ route: string[] }> }) {
  const route = (await params).route;
  const authUser = await requireAuth(req);
  const body = await req.json().catch(() => ({}));

  // ── 1. AUTH / LOGIN ─────────────────────────────────────────────────────────
  if (route[0] === "auth" && route[1] === "login") {
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const [user] = await db.select().from(usersTable).where(eq(sql`lower(${usersTable.email})`, email.toLowerCase())).limit(1);
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const token = signToken({ userId: user.id, role: user.role });
    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        region: user.region,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  }

  if (route[0] === "auth" && route[1] === "logout") {
    return NextResponse.json({ success: true, message: "Logged out" });
  }

  // ── 2. USERS CRUD ───────────────────────────────────────────────────────────
  if (route[0] === "users" && !route[1]) {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { email, name, password, role, region, smtpHost, smtpPort, smtpUser, smtpPass, dailyLimit } = body;
    if (!email || !name || !password) {
      return NextResponse.json({ error: "Email, name, and password required" }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      email,
      name,
      passwordHash,
      passwordPlain: password,
      role: role || "user",
      region: region || null,
    }).returning();

    if (smtpHost && smtpUser) {
      const existing = await db.select().from(accountsTable).where(eq(accountsTable.smtpUser, smtpUser)).limit(1);
      if (existing[0]) {
        await db.update(accountsTable).set({
          email,
          name,
          region: region || "Global",
          smtpHost,
          smtpPort: smtpPort || 587,
          smtpUser,
          ...(smtpPass ? { smtpPass } : {}),
          dailyLimit: dailyLimit || 500,
          isActive: true,
        }).where(eq(accountsTable.id, existing[0].id));
      } else if (smtpPass) {
        await db.insert(accountsTable).values({
          name,
          email,
          region: region || "Global",
          smtpHost,
          smtpPort: smtpPort || 587,
          smtpUser,
          smtpPass,
          dailyLimit: dailyLimit || 500,
          isActive: true,
        });
      }
    }

    return NextResponse.json(user, { status: 201 });
  }

  // ── 3. ACCOUNTS CRUD ────────────────────────────────────────────────────────
  if (route[0] === "accounts" && !route[1]) {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, email, region, smtpHost, smtpPort, smtpUser, smtpPass, dailyLimit, signature } = body;
    if (!name || !email || !region || !smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const [account] = await db.insert(accountsTable).values({
      name,
      email,
      region,
      smtpHost,
      smtpPort: smtpPort || 587,
      smtpUser,
      smtpPass,
      dailyLimit: dailyLimit || 500,
      signature: signature || null,
    }).returning();

    return NextResponse.json(safeAccount(account), { status: 201 });
  }

  // ── 4. TEMPLATES CRUD ───────────────────────────────────────────────────────
  if (route[0] === "templates" && !route[1]) {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, subject, htmlContent, textContent, category, variables } = body;
    if (!name || !subject || !htmlContent) {
      return NextResponse.json({ error: "Name, subject, and htmlContent required" }, { status: 400 });
    }
    const [template] = await db.insert(templatesTable).values({
      name,
      subject,
      htmlContent,
      textContent: textContent || null,
      category: category || null,
      variables: variables || [],
    }).returning();

    return NextResponse.json(template, { status: 201 });
  }

  // ── 4.5. ATTACHMENT CHUNKING ENDPOINTS (POST) ──────────────────────────────
  if (route[0] === "attachments" && route[1] === "chunk") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { uploadId, chunkIndex, content } = body;
    if (!uploadId || chunkIndex === undefined || !content) {
      return NextResponse.json({ error: "uploadId, chunkIndex, content are required" }, { status: 400 });
    }

    await db.insert(attachmentChunksTable).values({
      uploadId,
      chunkIndex,
      content,
    });

    return NextResponse.json({ success: true, message: `Chunk ${chunkIndex} received` }, { status: 201 });
  }

  if (route[0] === "attachments" && route[1] === "assemble") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { uploadId, name, filename, mimeType, type, isActive, assignedUserIds } = body;
    if (!uploadId || !name || !filename || !mimeType) {
      return NextResponse.json({ error: "uploadId, name, filename, mimeType are required" }, { status: 400 });
    }

    // Query chunks ordered by chunkIndex
    const chunks = await db
      .select()
      .from(attachmentChunksTable)
      .where(eq(attachmentChunksTable.uploadId, uploadId))
      .orderBy(attachmentChunksTable.chunkIndex);

    if (chunks.length === 0) {
      return NextResponse.json({ error: "No chunks found for this uploadId" }, { status: 400 });
    }

    // Concatenate chunks
    const fullContent = chunks.map(c => c.content).join("");

    // Clean up temporary chunks
    await db.delete(attachmentChunksTable).where(eq(attachmentChunksTable.uploadId, uploadId));

    // Save attachment in database
    const [row] = await db.insert(attachmentsTable).values({
      userId: authUser.id,
      name,
      filename,
      mimeType,
      type: type || "catalog",
      isActive: isActive !== false,
    }).returning();

    const compressedContent = compressContent(fullContent);
    await db.insert(attachmentContentsTable).values({
      attachmentId: row.id,
      content: compressedContent,
    });

    if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
      await db.insert(userAttachmentsTable).values(
        assignedUserIds.map((uId: number) => ({
          userId: uId,
          attachmentId: row.id,
        }))
      );
    }

    return NextResponse.json({
      ...row,
      content: fullContent,
      assignedUserIds: assignedUserIds || [],
    }, { status: 201 });
  }

  // ── 5. ATTACHMENTS CRUD ─────────────────────────────────────────────────────
  if (route[0] === "attachments" && !route[1]) {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, filename, mimeType, content, isActive, type, assignedUserIds } = body;
    if (!name || !filename || !mimeType || !content) {
      return NextResponse.json({ error: "name, filename, mimeType, content are required" }, { status: 400 });
    }

    if (content.length > 70 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size allowed is 50MB." }, { status: 400 });
    }

    const [row] = await db.insert(attachmentsTable).values({
      userId: authUser.id,
      name,
      filename,
      mimeType,
      type: type || "catalog",
      isActive: isActive !== false,
    }).returning();

    const compressedContent = compressContent(content);
    await db.insert(attachmentContentsTable).values({
      attachmentId: row.id,
      content: compressedContent,
    });

    if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
      await db.insert(userAttachmentsTable).values(
        assignedUserIds.map((uId: number) => ({
          userId: uId,
          attachmentId: row.id,
        }))
      );
    }

    return NextResponse.json({
      ...row,
      content,
      assignedUserIds: assignedUserIds || [],
    }, { status: 201 });
  }

  // ── 6. EMAILS DISPATCH (DB QUEUE BASED) ───────────────────────────────────────
  if (route[0] === "emails" && route[1] === "send") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { accountId, templateId, recipients, subject, htmlContent, delaySeconds, selectedCatalogIds } = body;
    if (!accountId || !templateId || !recipients || !subject) {
      return NextResponse.json({ error: "accountId, templateId, recipients, subject required" }, { status: 400 });
    }

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
    if (!account || !account.isActive) {
      return NextResponse.json({ error: "Account not found or inactive" }, { status: 400 });
    }

    const parsed = parseRecipients(recipients);
    const valid = parsed.filter(r => isValidEmail(r.email));

    if (valid.length === 0) {
      return NextResponse.json({ error: "No valid email addresses found" }, { status: 400 });
    }

    const delay = delaySeconds || 0;
    const now = new Date();

    const catalogIdsArray = Array.isArray(selectedCatalogIds)
      ? selectedCatalogIds
      : (body.selectedCatalogId ? [body.selectedCatalogId] : null);

    // Map each email into the database queue with specific future scheduledAt timestamps!
    const logInserts = valid.map((r, index) => {
      const scheduledTime = new Date(now.getTime() + index * delay * 1000);
      return {
        accountId,
        templateId,
        recipientEmail: r.email,
        recipientName: r.name || null,
        subject,
        status: "pending" as const,
        scheduledAt: scheduledTime,
        selectedCatalogIds: catalogIdsArray,
      };
    });

    let insertedCount = 0;
    const BATCH_SIZE = 500;
    for (let i = 0; i < logInserts.length; i += BATCH_SIZE) {
      const batch = logInserts.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(emailLogsTable).values(batch).returning({ id: emailLogsTable.id });
      insertedCount += inserted.length;
    }

    return NextResponse.json({
      queued: insertedCount,
      recipients: valid.length,
      message: `${insertedCount} emails successfully queued in your serverless database queue!`,
    });
  }

  // ── 7. EMAILS RETRY ──────────────────────────────────────────────────────────
  if (route[0] === "emails" && route[1] === "history" && route[3] === "retry") {
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = parseInt(route[2]);

    const [log] = await db
      .select()
      .from(emailLogsTable)
      .where(and(eq(emailLogsTable.id, id), eq(emailLogsTable.status, "failed")))
      .limit(1);

    if (!log) {
      return NextResponse.json({ error: "Email log not found or not failed" }, { status: 404 });
    }

    // Instantly reschedule it to run in the next cron minute cycle!
    await db
      .update(emailLogsTable)
      .set({ status: "pending", errorMessage: null, errorType: null, scheduledAt: new Date() })
      .where(eq(emailLogsTable.id, id));

    return NextResponse.json({ success: true, message: "Retry successfully rescheduled in database queue!" });
  }

  return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
}

// PATCH endpoint handler
export async function PATCH(req: Request, { params }: { params: Promise<{ route: string[] }> }) {
  const route = (await params).route;
  const authUser = await requireAuth(req);
  const body = await req.json().catch(() => ({}));
  const id = route[1] ? parseInt(route[1]) : null;

  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  // ── 1. USERS CRUD PATCH ─────────────────────────────────────────────────────
  if (route[0] === "users") {
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, role, region, isActive, password, smtpHost, smtpPort, smtpUser, smtpPass, dailyLimit } = body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (region !== undefined) updates.region = region;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password !== undefined) {
      updates.passwordHash = await bcrypt.hash(password, 10);
      updates.passwordPlain = password;
    }

    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      region: usersTable.region,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (smtpHost !== undefined || smtpUser !== undefined || smtpPass !== undefined || dailyLimit !== undefined) {
      let existing = await db.select().from(accountsTable).where(eq(accountsTable.email, user.email)).limit(1);
      if (!existing[0] && smtpUser) {
        existing = await db.select().from(accountsTable).where(eq(accountsTable.smtpUser, smtpUser)).limit(1);
      }

      if (existing[0]) {
        const accUpdates: Record<string, any> = {};
        accUpdates.email = user.email;
        if (name !== undefined) accUpdates.name = name;
        if (region !== undefined) accUpdates.region = region || "Global";
        if (smtpHost !== undefined) accUpdates.smtpHost = smtpHost;
        if (smtpPort !== undefined) accUpdates.smtpPort = smtpPort;
        if (smtpUser !== undefined) accUpdates.smtpUser = smtpUser;
        if (smtpPass !== undefined && smtpPass !== "") accUpdates.smtpPass = smtpPass;
        if (dailyLimit !== undefined) accUpdates.dailyLimit = dailyLimit;
        if (isActive !== undefined) accUpdates.isActive = isActive;

        await db.update(accountsTable).set(accUpdates).where(eq(accountsTable.id, existing[0].id));
      } else if (smtpHost && smtpUser && smtpPass) {
        await db.insert(accountsTable).values({
          name: user.name,
          email: user.email,
          region: user.region || "Global",
          smtpHost,
          smtpPort: smtpPort || 587,
          smtpUser,
          smtpPass,
          dailyLimit: dailyLimit || 500,
          isActive: user.isActive,
        });
      }
    }

    return NextResponse.json(user);
  }

  // ── 2. ACCOUNTS CRUD PATCH ──────────────────────────────────────────────────
  if (route[0] === "accounts") {
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, email, region, smtpHost, smtpPort, smtpUser, smtpPass, isActive, dailyLimit, signature } = body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (region !== undefined) updates.region = region;
    if (smtpHost !== undefined) updates.smtpHost = smtpHost;
    if (smtpPort !== undefined) updates.smtpPort = smtpPort;
    if (smtpUser !== undefined) updates.smtpUser = smtpUser;
    if (smtpPass !== undefined) updates.smtpPass = smtpPass;
    if (isActive !== undefined) updates.isActive = isActive;
    if (dailyLimit !== undefined) updates.dailyLimit = dailyLimit;
    if (signature !== undefined) updates.signature = signature;

    const [account] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json(safeAccount(account));
  }

  // ── 3. TEMPLATES CRUD PATCH ─────────────────────────────────────────────────
  if (route[0] === "templates") {
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, subject, htmlContent, textContent, category, variables } = body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (subject !== undefined) updates.subject = subject;
    if (htmlContent !== undefined) updates.htmlContent = htmlContent;
    if (textContent !== undefined) updates.textContent = textContent;
    if (category !== undefined) updates.category = category;
    if (variables !== undefined) updates.variables = variables;

    const [template] = await db.update(templatesTable).set(updates).where(eq(templatesTable.id, id)).returning();
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json(template);
  }

  // ── 4. ATTACHMENTS CRUD PATCH ───────────────────────────────────────────────
  if (route[0] === "attachments") {
    if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, isActive, content, assignedUserIds } = body;
    const updates: Partial<{ name: string; isActive: boolean }> = {};
    if (name !== undefined) updates.name = name;
    if (isActive !== undefined) updates.isActive = isActive;

    let row;
    if (Object.keys(updates).length > 0) {
      const [updated] = await db.update(attachmentsTable).set(updates).where(eq(attachmentsTable.id, id)).returning();
      row = updated;
    } else {
      const [existing] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)).limit(1);
      row = existing;
    }

    if (!row) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

    if (content !== undefined) {
      const compressedContent = compressContent(content);
      const [existingContent] = await db
        .select({ attachmentId: attachmentContentsTable.attachmentId })
        .from(attachmentContentsTable)
        .where(eq(attachmentContentsTable.attachmentId, id))
        .limit(1);
      if (existingContent) {
        await db
          .update(attachmentContentsTable)
          .set({ content: compressedContent })
          .where(eq(attachmentContentsTable.attachmentId, id));
      } else {
        await db
          .insert(attachmentContentsTable)
          .values({ attachmentId: id, content: compressedContent });
      }
    }

    if (assignedUserIds !== undefined && Array.isArray(assignedUserIds)) {
      await db.delete(userAttachmentsTable).where(eq(userAttachmentsTable.attachmentId, id));
      if (assignedUserIds.length > 0) {
        await db.insert(userAttachmentsTable).values(
          assignedUserIds.map((uId: number) => ({
            userId: uId,
            attachmentId: id,
          }))
        );
      }
    }

    const currentAssignments = await db
      .select()
      .from(userAttachmentsTable)
      .where(eq(userAttachmentsTable.attachmentId, id));

    return NextResponse.json({
      ...row,
      content: content !== undefined ? content : undefined,
      assignedUserIds: currentAssignments.map(a => a.userId),
    });
  }

  return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
}

// DELETE endpoint handler
export async function DELETE(req: Request, { params }: { params: Promise<{ route: string[] }> }) {
  const route = (await params).route;
  const authUser = await requireAuth(req);
  const id = route[1] ? parseInt(route[1]) : null;

  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  if (!requireAdmin(authUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── 1. USERS CRUD DELETE ────────────────────────────────────────────────────
  if (route[0] === "users") {
    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (targetUser) {
      await db.delete(accountsTable).where(eq(accountsTable.email, targetUser.email));
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    return NextResponse.json({ success: true, message: "User deleted" });
  }

  // ── 2. ACCOUNTS CRUD DELETE ─────────────────────────────────────────────────
  if (route[0] === "accounts") {
    await db.delete(accountsTable).where(eq(accountsTable.id, id));
    return NextResponse.json({ success: true, message: "Account deleted" });
  }

  // ── 3. TEMPLATES CRUD DELETE ────────────────────────────────────────────────
  if (route[0] === "templates") {
    await db.delete(templatesTable).where(eq(templatesTable.id, id));
    return NextResponse.json({ success: true, message: "Template deleted" });
  }

  // ── 4. ATTACHMENTS CRUD DELETE ──────────────────────────────────────────────
  if (route[0] === "attachments") {
    await db.delete(attachmentsTable).where(eq(attachmentsTable.id, id));
    return NextResponse.json({ success: true, message: "Attachment deleted" });
  }

  return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
}
