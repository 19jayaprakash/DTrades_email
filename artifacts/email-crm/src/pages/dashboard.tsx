import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { useGetDashboardStats, getGetDashboardStatsQueryKey, useGetAccountStats, getGetAccountStatsQueryKey, useGetDailyActivity, getGetDailyActivityQueryKey, useListErrors, getListErrorsQueryKey, useGetEmailQueue, getGetEmailQueueQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, AlertTriangle, Clock, CheckCircle2, TrendingUp, TrendingDown, Inbox, Layers } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { user } = useAuth();
  
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });
  const { data: accountStats, isLoading: accStatsLoading } = useGetAccountStats({ query: { queryKey: getGetAccountStatsQueryKey() } });
  const { data: dailyActivity, isLoading: dailyLoading } = useGetDailyActivity({ days: 30 }, { query: { queryKey: getGetDailyActivityQueryKey({ days: 30 }) } });
  const { data: errors, isLoading: errorsLoading } = useListErrors({ limit: 5 }, { query: { queryKey: getListErrorsQueryKey({ limit: 5 }) } });
  const { data: queue, isLoading: queueLoading } = useGetEmailQueue({ query: { queryKey: getGetEmailQueueQueryKey() } });

  if (user?.role !== "admin") {
    return <Redirect to="/compose" />;
  }

  if (statsLoading || accStatsLoading || dailyLoading || errorsLoading || queueLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">Real-time pulse of your outreach operations.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Sent" value={stats?.totalSent.toLocaleString() || "0"} icon={Send} />
          <StatCard title="Delivered" value={stats?.totalDelivered.toLocaleString() || "0"} icon={CheckCircle2} />
          <StatCard title="Failed" value={stats?.totalFailed.toLocaleString() || "0"} icon={AlertTriangle} variant="destructive" />
          <StatCard title="Pending" value={stats?.totalPending.toLocaleString() || "0"} icon={Clock} />
          <StatCard title="Open Rate" value={`${(stats?.openRate || 0).toFixed(1)}%`} icon={TrendingUp} />
          <StatCard title="Bounce Rate" value={`${(stats?.bounceRate || 0).toFixed(1)}%`} icon={TrendingDown} />
          <StatCard title="Active Accounts" value={`${stats?.activeAccounts}/${stats?.totalAccounts}`} icon={Inbox} />
          <StatCard title="Queue Total" value={queue?.total.toLocaleString() || "0"} icon={Layers} />
        </div>

        <div className="grid gap-6 md:grid-cols-7">
          <Card className="md:col-span-4">
            <CardHeader>
              <CardTitle>Send Volume (30 Days)</CardTitle>
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
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="sent" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSent)" name="Sent" />
                    <Area type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorFailed)" name="Failed" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {errors?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent errors</p>
                ) : (
                  errors?.map(err => (
                    <div key={err.id} className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{err.recipientEmail}</span>
                        <Badge variant="outline" className="text-xs">{err.errorType}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{err.errorMessage}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(err.createdAt).toLocaleString()} • {err.accountName}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account Performance</CardTitle>
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
                    <TableCell className="font-medium">{acc.accountName}</TableCell>
                    <TableCell>{acc.region}</TableCell>
                    <TableCell className="text-right">{acc.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-destructive">{acc.failed.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{acc.pending.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={acc.successRate && acc.successRate > 95 ? "default" : "secondary"}>
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

function StatCard({ title, value, icon: Icon, variant = "default" }: { title: string, value: string | number, icon: any, variant?: "default" | "destructive" }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${variant === 'destructive' ? 'text-destructive' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variant === 'destructive' ? 'text-destructive' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
