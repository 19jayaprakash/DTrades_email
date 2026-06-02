"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useListEmailHistory, getListEmailHistoryQueryKey, useRetryEmail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function History() {
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<number | null>(null);

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-serif text-[#1e293b]">History</h1>
          <p className="text-muted-foreground text-sm">Log of all scheduled and sent emails.</p>
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
                      <TableRow key={email.id}>
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
                          {email.status === "failed" && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={retryingId === email.id}
                              onClick={() => handleRetry(email.id)}
                            >
                              {retryingId === email.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                              Retry
                            </Button>
                          )}
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
    </AppLayout>
  );
}
