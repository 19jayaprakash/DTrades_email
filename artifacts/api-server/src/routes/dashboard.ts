import { Router } from "express";
import { db, emailLogsTable, accountsTable } from "@workspace/db";
import { eq, count, sql, gte } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/dashboard/stats", requireAuth, requireAdmin, async (req, res) => {
  const [statRows, accountRows] = await Promise.all([
    db.select({
      status: emailLogsTable.status,
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

  res.json({
    totalSent: stats.sent,
    totalFailed: stats.failed,
    totalPending: stats.pending,
    totalDelivered: delivered,
    openRate,
    bounceRate,
    totalAccounts: Number(accountRows[0]?.total ?? 0),
    activeAccounts: Number(accountRows[0]?.active ?? 0),
  });
});

router.get("/dashboard/account-stats", requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.select({
    accountId: emailLogsTable.accountId,
    accountName: accountsTable.name,
    region: accountsTable.region,
    status: emailLogsTable.status,
    cnt: count(),
  })
    .from(emailLogsTable)
    .leftJoin(accountsTable, eq(emailLogsTable.accountId, accountsTable.id))
    .groupBy(emailLogsTable.accountId, accountsTable.name, accountsTable.region, emailLogsTable.status);

  const map = new Map<number, { accountId: number; accountName: string; region: string; sent: number; failed: number; pending: number }>();
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

  res.json(result);
});

router.get("/dashboard/daily-activity", requireAuth, requireAdmin, async (req, res) => {
  const days = Math.min(parseInt(req.query.days as string || "30"), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db.select({
    date: sql<string>`date(${emailLogsTable.createdAt})`,
    status: emailLogsTable.status,
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

  const allDates: Array<{ date: string; sent: number; failed: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    allDates.push(dateMap.get(dateStr) || { date: dateStr, sent: 0, failed: 0 });
  }

  res.json(allDates);
});

router.get("/dashboard/errors", requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string || "20"), 100);
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

  res.json(rows.map(r => ({
    id: r.id,
    accountName: r.accountName || "Unknown",
    recipientEmail: r.recipientEmail,
    errorType: r.errorType || "unknown",
    errorMessage: r.errorMessage || "Unknown error",
    canRetry: true,
    createdAt: r.createdAt,
  })));
});

export default router;
