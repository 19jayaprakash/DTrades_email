"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useListEmailHistory, getListEmailHistoryQueryKey, useRetryEmail, useListAccounts } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCcw, CheckCircle2, XCircle, Clock, Calendar, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function History() {
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  const accountIdParam = selectedAccountId === "all" ? undefined : parseInt(selectedAccountId);

  const { data, isLoading } = useListEmailHistory(
    { page, limit: 20, accountId: accountIdParam }, 
    { query: { queryKey: getListEmailHistoryQueryKey({ page, limit: 20, accountId: accountIdParam }) } }
  );

  const { data: accounts } = useListAccounts({
    query: {
      enabled: isAdmin,
    }
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.hostname}:8080`;
    
    console.log(`[WebSocket] Connecting to ${wsUrl}...`);
    let ws: WebSocket;
    let reconnectTimeout: any;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[WebSocket] Connected successfully!");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "email_status_update" || message.type === "emails_queued") {
            queryClient.invalidateQueries({ queryKey: getListEmailHistoryQueryKey({ page, limit: 20, accountId: accountIdParam }) });
          }
        } catch (e) {
          console.error("[WebSocket] Failed to parse message:", e);
        }
      };

      ws.onclose = () => {
        console.log("[WebSocket] Disconnected. Reconnecting in 3s...");
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("[WebSocket] Error occurred:", err);
        ws.close();
      };
    }

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, [queryClient, page, selectedAccountId]);

  const retryMutation = useRetryEmail();

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await retryMutation.mutateAsync({ id });
      toast({ title: "Email added to retry queue" });
      queryClient.invalidateQueries({ queryKey: getListEmailHistoryQueryKey({ page, limit: 20 }) });
    } catch (e) {
      toast({ title: "Failed to retry email", variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent": return <span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className="status-dot status-dot-success" />Sent</span>;
      case "failed": return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive"><span className="status-dot status-dot-error" />Failed</span>;
      case "pending": return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><span className="status-dot status-dot-pending" />Pending</span>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">History</h1>
            <p className="text-muted-foreground text-sm">Log of all scheduled and sent emails. Click any row to view full pipeline stages.</p>
          </div>

          {isAdmin && accounts && accounts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Filter Account:</span>
              <Select value={selectedAccountId} onValueChange={(val) => { setSelectedAccountId(val); setPage(1); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id.toString()}>
                      {acc.name} ({acc.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        <Card className="rounded-2xl animate-fade-in-up stagger-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Email Log</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : data?.data.length === 0 ? (
              <p className="text-center text-muted-foreground p-8 text-sm">No email history found.</p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.data.map((email) => (
                      <TableRow 
                        key={email.id} 
                        className="cursor-pointer hover:bg-primary/[0.02] transition-all duration-150"
                        onClick={() => setSelectedEmail(email)}
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(email.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{email.accountName}</TableCell>
                        <TableCell className="text-sm">
                          <div>{email.recipientEmail}</div>
                          {email.recipientName && <div className="text-xs text-muted-foreground">{email.recipientName}</div>}
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate text-sm" title={email.subject}>{email.subject}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            {getStatusBadge(email.status)}
                            {email.errorMessage && <span className="text-[10px] text-destructive max-w-[150px] truncate" title={email.errorMessage}>{email.errorMessage}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); setSelectedEmail(email); }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {email.status === "failed" && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                disabled={retryingId === email.id}
                                onClick={(e) => { e.stopPropagation(); handleRetry(email.id); }}
                              >
                                {retryingId === email.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                                Retry
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                <div className="flex justify-between items-center pt-2">
                  <div className="text-xs text-muted-foreground">
                    Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data?.total || 0)} of {data?.total} entries
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <span className="text-xs font-medium text-muted-foreground px-2">Page {page}</span>
                    <Button variant="outline" size="sm" disabled={page * 20 >= (data?.total || 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delivery Stages Dialog Modal */}
      {selectedEmail && (
        <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl border-b pb-3 text-foreground">Email Delivery Stages</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 pt-5">
              {/* Stage 1: Queued */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="rounded-full p-1 bg-primary/10 text-primary border border-primary/20">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="w-0.5 h-12 bg-primary/20"></div>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-foreground">Stage 1: Enqueued in Database</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Campaign batch successfully committed to database store</p>
                  <span className="inline-block text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground mt-2 font-mono">
                    {new Date(selectedEmail.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Stage 2: Scheduled */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="rounded-full p-1 bg-primary/10 text-primary border border-primary/20">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="w-0.5 h-12 bg-primary/20"></div>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-foreground">Stage 2: Campaign Timing Matured</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Scheduled offset released and queued for SMTP dispatch</p>
                  <span className="inline-block text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground mt-2 font-mono">
                    {new Date(selectedEmail.scheduledAt || selectedEmail.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Stage 3: Send Status */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  {selectedEmail.status === "sent" ? (
                    <div className="rounded-full p-1 bg-primary/10 text-primary border border-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  ) : selectedEmail.status === "failed" ? (
                    <div className="rounded-full p-1 bg-destructive/10 text-destructive border border-destructive/20">
                      <XCircle className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="rounded-full p-1 bg-amber-50 text-amber-600 border border-amber-200 animate-pulse">
                      <Clock className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-foreground">
                    Stage 3: {selectedEmail.status === "sent" ? "SMTP Transmission Completed" : selectedEmail.status === "failed" ? "SMTP Transmission Failed" : "SMTP Dispatch Pending"}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {selectedEmail.status === "sent" 
                      ? `Successfully delivered to recipient inbox via ${selectedEmail.accountName}`
                      : selectedEmail.status === "failed" 
                      ? `Transmission halted: ${selectedEmail.errorMessage || "SMTP handshake refused"}` 
                      : "Outbox buffer processing; awaiting cron trigger execution slot..."}
                  </p>
                  {selectedEmail.sentAt && (
                    <span className="inline-block text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground mt-2 font-mono">
                      {new Date(selectedEmail.sentAt).toLocaleString()}
                    </span>
                  )}
                  
                  {selectedEmail.status === "failed" && selectedEmail.errorDetails && (
                    <div className="mt-4 border rounded-md overflow-hidden bg-muted">
                      <div className="bg-muted/80 px-3 py-1.5 text-xs font-semibold text-foreground">
                        Error Diagnostic Details (JSON)
                      </div>
                      <pre className="p-3 text-[10px] overflow-x-auto text-muted-foreground font-mono max-h-[200px] overflow-y-auto">
                        {selectedEmail.errorDetails}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
