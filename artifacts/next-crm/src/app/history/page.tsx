"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useListEmailHistory, getListEmailHistoryQueryKey, useRetryEmail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCcw, CheckCircle2, XCircle, Clock, Calendar, Eye } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function History() {
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);

  const { data, isLoading } = useListEmailHistory(
    { page, limit: 20 }, 
    { query: { queryKey: getListEmailHistoryQueryKey({ page, limit: 20 }) } }
  );

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
      case "sent": return <Badge className="bg-green-500 hover:bg-green-600 text-xs">Sent</Badge>;
      case "failed": return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      case "pending": return <Badge variant="secondary" className="text-xs">Pending</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-serif text-[#1e293b]">History</h1>
            <p className="text-muted-foreground text-sm">Log of all scheduled and sent emails. Click any row to view full pipeline stages.</p>
          </div>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif">Email Log</CardTitle>
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
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
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
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
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
              <DialogTitle className="font-serif text-xl border-b pb-3 text-slate-800">Email Delivery Stages</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 pt-5">
              {/* Stage 1: Queued */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="rounded-full p-1 bg-green-50 text-green-600 border border-green-200">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="w-0.5 h-12 bg-green-100"></div>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-800">Stage 1: Enqueued in Database</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Campaign batch successfully committed to database store</p>
                  <span className="inline-block text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 mt-2 font-mono">
                    {new Date(selectedEmail.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Stage 2: Scheduled */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="rounded-full p-1 bg-green-50 text-green-600 border border-green-200">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="w-0.5 h-12 bg-green-100"></div>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-800">Stage 2: Campaign Timing Matured</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Scheduled offset released and queued for SMTP dispatch</p>
                  <span className="inline-block text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 mt-2 font-mono">
                    {new Date(selectedEmail.scheduledAt || selectedEmail.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Stage 3: Send Status */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  {selectedEmail.status === "sent" ? (
                    <div className="rounded-full p-1 bg-green-50 text-green-600 border border-green-200">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  ) : selectedEmail.status === "failed" ? (
                    <div className="rounded-full p-1 bg-red-50 text-red-600 border border-red-200">
                      <XCircle className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="rounded-full p-1 bg-blue-50 text-blue-600 border border-blue-200 animate-pulse">
                      <Clock className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-800">
                    Stage 3: {selectedEmail.status === "sent" ? "SMTP Transmission Completed" : selectedEmail.status === "failed" ? "SMTP Transmission Failed" : "SMTP Dispatch Pending"}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {selectedEmail.status === "sent" 
                      ? `Successfully delivered to recipient inbox via ${selectedEmail.accountName}`
                      : selectedEmail.status === "failed" 
                      ? `Transmission halted: ${selectedEmail.errorMessage || "SMTP handshake refused"}` 
                      : "Outbox buffer processing; awaiting cron trigger execution slot..."}
                  </p>
                  {selectedEmail.sentAt && (
                    <span className="inline-block text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 mt-2 font-mono">
                      {new Date(selectedEmail.sentAt).toLocaleString()}
                    </span>
                  )}
                  
                  {selectedEmail.status === "failed" && selectedEmail.errorDetails && (
                    <div className="mt-4 border rounded-md overflow-hidden bg-slate-50">
                      <div className="bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                        Error Diagnostic Details (JSON)
                      </div>
                      <pre className="p-3 text-[10px] overflow-x-auto text-slate-600 font-mono max-h-[200px] overflow-y-auto">
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
