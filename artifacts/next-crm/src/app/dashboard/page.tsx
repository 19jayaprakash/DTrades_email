"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { 
  useGetDashboardStats, 
  getGetDashboardStatsQueryKey, 
  useGetAccountStats, 
  getGetAccountStatsQueryKey, 
  useGetDailyActivity, 
  getGetDailyActivityQueryKey, 
  useListErrors, 
  getListErrorsQueryKey, 
  useGetEmailQueue, 
  getGetEmailQueueQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, AlertTriangle, Clock, CheckCircle2, TrendingUp, TrendingDown, Inbox, Layers } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const statCardConfig: Record<string, string> = {
  "Total Sent": "stat-icon-indigo",
  "Delivered": "stat-icon-emerald",
  "Failed": "stat-icon-rose",
  "Pending": "stat-icon-amber",
  "Open Rate": "stat-icon-indigo",
  "Bounce Rate": "stat-icon-rose",
  "Active Accounts": "stat-icon-emerald",
  "Queue Total": "stat-icon-amber",
};

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });
  const { data: accountStats, isLoading: accStatsLoading } = useGetAccountStats({ query: { queryKey: getGetAccountStatsQueryKey() } });
  const { data: dailyActivity, isLoading: dailyLoading } = useGetDailyActivity({ days: 30 }, { query: { queryKey: getGetDailyActivityQueryKey({ days: 30 }) } });
  const { data: errors, isLoading: errorsLoading } = useListErrors({ limit: 5 }, { query: { queryKey: getListErrorsQueryKey({ limit: 5 }) } });
  const { data: queue, isLoading: queueLoading } = useGetEmailQueue({ query: { queryKey: getGetEmailQueueQueryKey() } });

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/compose");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return null;
  }

  if (statsLoading || accStatsLoading || dailyLoading || errorsLoading || queueLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const statCards = [
    { title: "Total Sent", value: stats?.totalSent.toLocaleString() || "0", icon: Send },
    { title: "Delivered", value: stats?.totalDelivered.toLocaleString() || "0", icon: CheckCircle2 },
    { title: "Failed", value: stats?.totalFailed.toLocaleString() || "0", icon: AlertTriangle, variant: "destructive" as const },
    { title: "Pending", value: stats?.totalPending.toLocaleString() || "0", icon: Clock },
    { title: "Open Rate", value: `${(stats?.openRate || 0).toFixed(1)}%`, icon: TrendingUp },
    { title: "Bounce Rate", value: `${(stats?.bounceRate || 0).toFixed(1)}%`, icon: TrendingDown },
    { title: "Active Accounts", value: `${stats?.activeAccounts}/${stats?.totalAccounts}`, icon: Inbox },
    { title: "Queue Total", value: queue?.total.toLocaleString() || "0", icon: Layers },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Real-time pulse of your outreach operations.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card, index) => (
            <div key={card.title} className={`animate-fade-in-up stagger-${index + 1}`}>
              <StatCard
                title={card.title}
                value={card.value}
                icon={card.icon}
                variant={card.variant || "default"}
                iconClass={statCardConfig[card.title] || "stat-icon-indigo"}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-7">
          <Card className="md:col-span-4 rounded-2xl animate-fade-in-up stagger-3">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%))' }} />
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Send Volume</CardTitle>
                  <p className="text-sm text-muted-foreground">Last 30 days activity</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyActivity || []}>
                    <defs>
                      <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="sent" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSent)" name="Sent" />
                    <Area type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorFailed)" name="Failed" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-3 rounded-2xl animate-fade-in-up stagger-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, hsl(0, 84%, 60%), hsl(0, 72%, 50%))' }} />
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Recent Errors</CardTitle>
                  <p className="text-sm text-muted-foreground">Latest delivery failures</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-[350px] overflow-y-auto no-scrollbar">
                {errors?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent errors</p>
                ) : (
                  errors?.map(err => (
                    <div key={err.id} className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="status-dot status-dot-error" />
                          <span className="text-sm font-medium truncate max-w-[150px] text-foreground">{err.recipientEmail}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] scale-90 origin-right">{err.errorType}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground truncate pl-4">{err.errorMessage}</span>
                      <span className="text-[10px] text-muted-foreground pl-4">{new Date(err.createdAt).toLocaleString()} • {err.accountName}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl animate-fade-in-up stagger-5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, hsl(142, 71%, 45%), hsl(142, 76%, 36%))' }} />
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Account Performance</CardTitle>
                <p className="text-sm text-muted-foreground">Breakdown by sender account</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountStats?.map(acc => (
                  <TableRow key={acc.accountId}>
                    <TableCell className="font-medium text-sm text-foreground">{acc.accountName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{acc.region}</TableCell>
                    <TableCell className="text-right text-sm">{acc.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-destructive text-sm">{acc.failed.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{acc.pending.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={acc.successRate && acc.successRate > 95 ? "default" : "secondary"} className="text-xs">
                        {acc.successRate?.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon: Icon, variant = "default", iconClass = "stat-icon-indigo" }: { title: string, value: string | number, icon: any, variant?: "default" | "destructive", iconClass?: string }) {
  return (
    <Card className="card-hover rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconClass}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variant === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
